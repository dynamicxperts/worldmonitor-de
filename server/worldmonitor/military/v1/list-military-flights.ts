import type {
  ServerContext,
  ListMilitaryFlightsRequest,
  ListMilitaryFlightsResponse,
  MilitaryAircraftType,
  MilitaryOperator,
  MilitaryConfidence,
} from '../../../../src/generated/server/worldmonitor/military/v1/service_server';

import { isMilitaryCallsign, isMilitaryHex, detectAircraftType, UPSTREAM_TIMEOUT_MS } from './_shared';
import { cachedFetchJson, getRawJson } from '../../../_shared/redis';
import { markNoCacheResponse } from '../../../_shared/response-headers';

// Aviation backend: airplanes.live (community ADS-B aggregator), reached
// through our AWS-hosted wm-out relay (`wm-out.api.sudoself.com/v1/mil`).
//
// We migrated off OpenSky in 2026-05 because OpenSky's Cloudflare WAF blocks
// every Vercel egress IP by deliberate policy. We then discovered Vercel's
// egress is *also* silently blocked from `api.airplanes.live` (4 deploys
// returning 0 flights, identical code from AWS Lambda returns 184+ aircraft).
// AWS Lambda IPs are NOT blocked, so we route through the wm-out HTTP API
// (which already proxies our jet, MC, UC, WR, MR endpoints from Vercel ->
// AWS). The relay Lambda (`sudoself-prod-wm-outbound-mil`) caches /v2/mil
// for 60s in-process to stay polite to airplanes.live.
//
// MIL_RELAY_URL points at the AWS relay; MIL_RELAY_TOKEN is the wm-out
// bearer token (SSM /sudoself/worldmonitor/outbound-token).
//
// Field translation (airplanes.live -> downstream proto shape):
//   hex      -> id / hexCode (uppercase)
//   flight   -> callsign (string, may have trailing whitespace)
//   lat,lon  -> location.{latitude,longitude} (degrees, same as OpenSky)
//   alt_baro -> altitude (FEET in upstream → multiply by 0.3048 for METERS,
//               which is what the proto / OpenSky code expects)
//   gs       -> speed    (KNOTS in upstream → multiply by 0.5144 for M/S)
//   track    -> heading  (degrees, same as OpenSky)
//   seen     -> staleness gate; drop entries with seen > SEEN_CUTOFF_S
// /v2/all was deprecated; use /v2/mil for the military-only feed (a few
// hundred aircraft worldwide vs. ~30k for /v2/all). The downstream filter
// (mil / callsign / ICAO heuristic) stays as defense-in-depth in case
// MIL_RELAY_URL is overridden back to a non-/v2/mil source.
const MIL_RELAY_URL = process.env.MIL_RELAY_URL || 'https://wm-out.api.sudoself.com/v1/mil';
const MIL_RELAY_TOKEN = process.env.MIL_RELAY_TOKEN || '';
// Legacy env var preserved for tests / local dev that point straight at
// airplanes.live. Production uses MIL_RELAY_URL.
const AIRPLANES_LIVE_URL = process.env.AIRPLANES_LIVE_URL || MIL_RELAY_URL;
const AIRPLANES_LIVE_UA =
  'dynamic-experts-worldmonitor-de/1.0 (+https://dynamicexperts.com)';
const FT_TO_M = 0.3048;
const KT_TO_MPS = 0.5144;
const SEEN_CUTOFF_S = 300; // drop aircraft not heard from in >5 min

// v6 cache key — v5 was poisoned by the milFlag-scope-bug + isMilFeed-pattern
// deploys (2.8.7-2.8.8). Both produced cached empty results.
const REDIS_CACHE_KEY = 'military:flights:v6:mil-relay';
const REDIS_CACHE_TTL = 600; // 10 min — be polite to airplanes.live community service
const REDIS_STALE_KEY = 'military:flights:stale:v1';

/** Snap a coordinate to a grid step so nearby bbox values share cache entries. */
const quantize = (v: number, step: number) => Math.round(v / step) * step;
const BBOX_GRID_STEP = 1; // 1-degree grid (~111 km at equator)

interface RequestBounds {
  south: number;
  north: number;
  west: number;
  east: number;
}


function normalizeBounds(req: ListMilitaryFlightsRequest): RequestBounds {
  return {
    south: Math.min(req.swLat, req.neLat),
    north: Math.max(req.swLat, req.neLat),
    west: Math.min(req.swLon, req.neLon),
    east: Math.max(req.swLon, req.neLon),
  };
}

function filterFlightsToBounds(
  flights: ListMilitaryFlightsResponse['flights'],
  bounds: RequestBounds,
): ListMilitaryFlightsResponse['flights'] {
  return flights.filter((flight) => {
    const lat = flight.location?.latitude;
    const lon = flight.location?.longitude;
    if (lat == null || lon == null) return false;
    return lat >= bounds.south && lat <= bounds.north && lon >= bounds.west && lon <= bounds.east;
  });
}

const AIRCRAFT_TYPE_MAP: Record<string, string> = {
  tanker: 'MILITARY_AIRCRAFT_TYPE_TANKER',
  awacs: 'MILITARY_AIRCRAFT_TYPE_AWACS',
  transport: 'MILITARY_AIRCRAFT_TYPE_TRANSPORT',
  reconnaissance: 'MILITARY_AIRCRAFT_TYPE_RECONNAISSANCE',
  drone: 'MILITARY_AIRCRAFT_TYPE_DRONE',
  bomber: 'MILITARY_AIRCRAFT_TYPE_BOMBER',
  fighter: 'MILITARY_AIRCRAFT_TYPE_FIGHTER',
  helicopter: 'MILITARY_AIRCRAFT_TYPE_HELICOPTER',
  vip: 'MILITARY_AIRCRAFT_TYPE_VIP',
  special_ops: 'MILITARY_AIRCRAFT_TYPE_SPECIAL_OPS',
};

const OPERATOR_MAP: Record<string, string> = {
  usaf: 'MILITARY_OPERATOR_USAF',
  raf: 'MILITARY_OPERATOR_RAF',
  faf: 'MILITARY_OPERATOR_FAF',
  gaf: 'MILITARY_OPERATOR_GAF',
  iaf: 'MILITARY_OPERATOR_IAF',
  nato: 'MILITARY_OPERATOR_NATO',
  other: 'MILITARY_OPERATOR_OTHER',
};

const CONFIDENCE_MAP: Record<string, string> = {
  high: 'MILITARY_CONFIDENCE_HIGH',
  medium: 'MILITARY_CONFIDENCE_MEDIUM',
  low: 'MILITARY_CONFIDENCE_LOW',
};

interface StaleFlight {
  id?: string;
  callsign?: string;
  hexCode?: string;
  registration?: string;
  aircraftType?: string;
  aircraftModel?: string;
  operator?: string;
  operatorCountry?: string;
  lat?: number | null;
  lon?: number | null;
  altitude?: number;
  heading?: number;
  speed?: number;
  verticalRate?: number;
  onGround?: boolean;
  squawk?: string;
  origin?: string;
  destination?: string;
  lastSeenMs?: number;
  firstSeenMs?: number;
  confidence?: string;
  isInteresting?: boolean;
  note?: string;
}

interface StalePayload {
  flights?: StaleFlight[];
  fetchedAt?: number;
}

/**
 * Convert the seed cron's app-shape flight (flat lat/lon, lowercase enums,
 * lastSeenMs) into the proto shape (nested GeoCoordinates, enum strings,
 * lastSeenAt). Mirrors the inverse of src/services/military-flights.ts:mapProtoFlight.
 * hexCode is canonicalized to uppercase per the invariant documented on
 * MilitaryFlight.hex_code in military_flight.proto.
 */
function staleToProto(f: StaleFlight): ListMilitaryFlightsResponse['flights'][number] | null {
  if (f.lat == null || f.lon == null) return null;
  const icao = (f.hexCode || f.id || '').toUpperCase();
  if (!icao) return null;
  return {
    id: icao,
    callsign: (f.callsign || '').trim(),
    hexCode: icao,
    registration: f.registration || '',
    aircraftType: (AIRCRAFT_TYPE_MAP[f.aircraftType || ''] || 'MILITARY_AIRCRAFT_TYPE_UNKNOWN') as MilitaryAircraftType,
    aircraftModel: f.aircraftModel || '',
    operator: (OPERATOR_MAP[f.operator || ''] || 'MILITARY_OPERATOR_OTHER') as MilitaryOperator,
    operatorCountry: f.operatorCountry || '',
    location: { latitude: f.lat, longitude: f.lon },
    altitude: f.altitude ?? 0,
    heading: f.heading ?? 0,
    speed: f.speed ?? 0,
    verticalRate: f.verticalRate ?? 0,
    onGround: f.onGround ?? false,
    squawk: f.squawk || '',
    origin: f.origin || '',
    destination: f.destination || '',
    lastSeenAt: f.lastSeenMs ?? Date.now(),
    firstSeenAt: f.firstSeenMs ?? 0,
    confidence: (CONFIDENCE_MAP[f.confidence || ''] || 'MILITARY_CONFIDENCE_LOW') as MilitaryConfidence,
    isInteresting: f.isInteresting ?? false,
    note: f.note || '',
    enrichment: undefined,
  };
}

// Negative cache for the stale Redis read — mirrors the legacy
// /api/military-flights handler's NEG_TTL=30_000ms. When the live fetch fails
// AND the stale key is also empty/unparseable, suppress further Redis reads
// of REDIS_STALE_KEY for STALE_NEG_TTL_MS so we don't hammer Redis once per
// request during sustained relay+seed outages. Per-isolate (Vercel Edge state),
// which is fine — each warm isolate gets its own 30s suppression window.
const STALE_NEG_TTL_MS = 30_000;
let staleNegUntil = 0;

// Test seam — exposed for unit tests that need to drive the suppression
// window without sleeping. Not exported from the module's public API.
export function _resetStaleNegativeCacheForTests(): void {
  staleNegUntil = 0;
}

async function fetchStaleFallback(): Promise<ListMilitaryFlightsResponse['flights'] | null> {
  const now = Date.now();
  if (now < staleNegUntil) return null;
  try {
    const raw = (await getRawJson(REDIS_STALE_KEY)) as StalePayload | null;
    if (!raw || !Array.isArray(raw.flights) || raw.flights.length === 0) {
      staleNegUntil = now + STALE_NEG_TTL_MS;
      return null;
    }
    const flights = raw.flights
      .map(staleToProto)
      .filter((f): f is NonNullable<typeof f> => f != null);
    if (flights.length === 0) {
      staleNegUntil = now + STALE_NEG_TTL_MS;
      return null;
    }
    return flights;
  } catch {
    staleNegUntil = now + STALE_NEG_TTL_MS;
    return null;
  }
}

export async function listMilitaryFlights(
  ctx: ServerContext,
  req: ListMilitaryFlightsRequest,
): Promise<ListMilitaryFlightsResponse> {
  try {
    if (!req.neLat && !req.neLon && !req.swLat && !req.swLon) return { flights: [], clusters: [], pagination: undefined };
    const requestBounds = normalizeBounds(req);

    // Quantize bbox to a 1° grid so nearby map views share cache entries.
    // Precise coordinates caused near-zero hit rate since every pan/zoom created a unique key.
    const quantizedBB = [
      quantize(req.swLat, BBOX_GRID_STEP),
      quantize(req.swLon, BBOX_GRID_STEP),
      quantize(req.neLat, BBOX_GRID_STEP),
      quantize(req.neLon, BBOX_GRID_STEP),
    ].join(':');
    const cacheKey = `${REDIS_CACHE_KEY}:${quantizedBB}:${req.operator || ''}:${req.aircraftType || ''}:${req.pageSize || 0}`;

    const fullResult = await cachedFetchJson<ListMilitaryFlightsResponse>(
      cacheKey,
      REDIS_CACHE_TTL,
      async () => {
        // Single global airplanes.live fetch, then post-filter to bbox.
        // /v2/all is ~6-7 MB JSON but only fetched once per REDIS_CACHE_TTL
        // window (10 min) across all map views — well within polite-use.
        const headers: Record<string, string> = {
          'User-Agent': AIRPLANES_LIVE_UA,
          Accept: 'application/json',
        };
        if (MIL_RELAY_TOKEN) {
          headers.Authorization = `Bearer ${MIL_RELAY_TOKEN}`;
        }
        const resp = await fetch(AIRPLANES_LIVE_URL, {
          headers,
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });

        if (!resp.ok) return null;

        const data = (await resp.json()) as {
          ac?: Array<{
            hex?: string;
            flight?: string;
            lat?: number | null;
            lon?: number | null;
            alt_baro?: number | string | null;
            alt_geom?: number | null;
            gs?: number | null;
            track?: number | null;
            seen?: number | null;
            mil?: number | boolean;
            category?: string;
            t?: string;     // ICAO type designator (e.g. "C30J", "GLF5")
            desc?: string;  // human description (e.g. "GULFSTREAM V")
          }>;
        };
        if (!Array.isArray(data.ac)) return null;

        const flights: ListMilitaryFlightsResponse['flights'] = [];
        for (const ac of data.ac) {
          const lat = ac.lat;
          const lon = ac.lon;
          if (lat == null || lon == null) continue;

          // alt_baro can be the literal string "ground"
          const onGround = typeof ac.alt_baro === 'string' && ac.alt_baro.toLowerCase() === 'ground';
          if (onGround) continue;

          // Drop stale entries — `seen` is seconds since last contact.
          if (typeof ac.seen === 'number' && ac.seen > SEEN_CUTOFF_S) continue;

          const callsign = (ac.flight || '').trim();
          const icao24 = (ac.hex || '').toLowerCase();
          if (!icao24) continue;
          // ICAO type designator (e.g. "C30J", "GLF5") — carried to the client
          // in aircraftModel so the map can pick a type-specific silhouette.
          const typeCode = (ac.t || '').toUpperCase().trim();

          // Military filter: when fetching a `/<v>/mil` endpoint the upstream
          // pre-filters to military, so trust the feed. For a fallback /v2/all
          // override, fall back to the upstream `mil` flag plus callsign and
          // ICAO range heuristics.
          //
          // milFlag is hoisted out of the `if (!isMilFeed)` block on purpose —
          // 2.8.7 + 2.8.8 had it `const`-scoped inside the block, which made
          // the reference at `confidence: milFlag ? ...` below a ReferenceError
          // at runtime. The outer try/catch swallowed that into an empty-flights
          // response (the bug we shipped 6 deploys chasing).
          const milFlag = ac.mil === 1 || ac.mil === true;
          // Match both /v1/mil (our wm-out relay) and /v2/mil (direct
          // airplanes.live). 2.8.7 only checked '/v2/mil', so the relay path
          // was treated as /v2/all and the heuristic filter below ran against
          // a feed whose entries don't necessarily set `mil:1`.
          const isMilFeed =
            AIRPLANES_LIVE_URL.endsWith('/mil') ||
            AIRPLANES_LIVE_URL.includes('/mil?') ||
            AIRPLANES_LIVE_URL.includes('/mil/');
          if (!isMilFeed) {
            if (!milFlag && !isMilitaryCallsign(callsign) && !isMilitaryHex(icao24)) continue;
          }

          const aircraftType = detectAircraftType(callsign);
          // Canonicalize hex_code to uppercase — the seed cron
          // (scripts/seed-military-flights.mjs) writes uppercase, and
          // src/services/military-flights.ts getFlightByHex uppercases the
          // lookup input. Preserving lowercase here would break every hex
          // lookup silently.
          const hex = icao24.toUpperCase();

          // Altitude: airplanes.live ships FEET. Downstream proto shape
          // expects METERS (matches OpenSky semantics).
          const altRaw =
            typeof ac.alt_geom === 'number'
              ? ac.alt_geom
              : typeof ac.alt_baro === 'number'
                ? ac.alt_baro
                : null;
          const altitudeM = altRaw != null ? altRaw * FT_TO_M : 0;

          // Velocity: airplanes.live `gs` is KNOTS. Proto expects M/S.
          const velocityMps = typeof ac.gs === 'number' ? ac.gs * KT_TO_MPS : 0;

          flights.push({
            id: hex,
            callsign,
            hexCode: hex,
            registration: '',
            aircraftType: (AIRCRAFT_TYPE_MAP[aircraftType] || 'MILITARY_AIRCRAFT_TYPE_UNKNOWN') as MilitaryAircraftType,
            aircraftModel: typeCode,
            operator: 'MILITARY_OPERATOR_OTHER',
            operatorCountry: '',
            location: { latitude: lat, longitude: lon },
            altitude: altitudeM,
            heading: typeof ac.track === 'number' ? ac.track : 0,
            speed: velocityMps,
            verticalRate: 0,
            onGround: false,
            squawk: '',
            origin: '',
            destination: '',
            lastSeenAt: Date.now(),
            firstSeenAt: 0,
            confidence: milFlag ? 'MILITARY_CONFIDENCE_MEDIUM' : 'MILITARY_CONFIDENCE_LOW',
            isInteresting: false,
            note: '',
            enrichment: undefined,
          });
        }

        return flights.length > 0 ? { flights, clusters: [], pagination: undefined } : null;
      },
    );

    if (!fullResult) {
      // Live fetch failed. The legacy /api/military-flights handler cascaded
      // military:flights:v1 → military:flights:stale:v1 before returning empty.
      // The seed cron (scripts/seed-military-flights.mjs) writes both keys
      // every run; stale has a 24h TTL versus 10min live, so it's the right
      // fallback when OpenSky / the relay hiccups.
      const staleFlights = await fetchStaleFallback();
      if (staleFlights && staleFlights.length > 0) {
        return { flights: filterFlightsToBounds(staleFlights, requestBounds), clusters: [], pagination: undefined };
      }
      markNoCacheResponse(ctx.request);
      return { flights: [], clusters: [], pagination: undefined };
    }
    return { ...fullResult, flights: filterFlightsToBounds(fullResult.flights, requestBounds) };
  } catch {
    markNoCacheResponse(ctx.request);
    return { flights: [], clusters: [], pagination: undefined };
  }
}
