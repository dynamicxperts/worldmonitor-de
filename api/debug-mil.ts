// Diagnostic endpoint for the military-flights → wm-out relay path.
//
// We deployed list-military-flights.ts → wm-out.api.sudoself.com/v1/mil and
// the main endpoint kept returning {flights:[]} despite direct curl to the
// relay returning 286 aircraft. We have no Vercel function logs visible from
// the dev sandbox, so this endpoint reports what the function actually sees
// from the relay: env-var values (just the URL + token length, never the
// token), upstream HTTP status, body size, parsed `ac` array length, and
// per-step elapsed times. Returns JSON so the next round of debugging can
// `curl` it instead of waiting on logs.
//
// Deliberately public (no auth), GET-only. The BYPASS_AUTH gate already
// allows anonymous GETs across this private fork; we mirror that. No secrets
// are returned — only the relay URL (which is already public DNS) and a
// length count for the bearer.

export const config = { runtime: 'edge' };

const RELAY_URL = process.env.MIL_RELAY_URL || 'https://wm-out.api.sudoself.com/v1/mil';
const RELAY_TOKEN = process.env.MIL_RELAY_TOKEN || '';
const TIMEOUT_MS = 10_000;

export default async function handler(_req: Request): Promise<Response> {
  const startedAt = Date.now();
  let upstreamStatus: number | null = null;
  let upstreamHeaders: Record<string, string> | null = null;
  let bodySize: number | null = null;
  let aircraftCount: number | null = null;
  let firstSampleHex: string | null = null;
  let errorMessage: string | null = null;

  try {
    const resp = await fetch(RELAY_URL, {
      headers: {
        Authorization: `Bearer ${RELAY_TOKEN}`,
        'User-Agent': 'wm-debug/1.0 (+https://dynamicexperts.com)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    upstreamStatus = resp.status;
    upstreamHeaders = {
      'content-type': resp.headers.get('content-type') ?? '',
      'cache-control': resp.headers.get('cache-control') ?? '',
      'content-length': resp.headers.get('content-length') ?? '',
    };
    const body = await resp.text();
    bodySize = body.length;
    if (resp.ok) {
      try {
        const data = JSON.parse(body) as { ac?: Array<{ hex?: string }> };
        if (Array.isArray(data.ac)) {
          aircraftCount = data.ac.length;
          firstSampleHex = data.ac[0]?.hex ?? null;
        } else {
          aircraftCount = -1;
        }
      } catch (parseErr) {
        errorMessage = `parse_error: ${String((parseErr as Error)?.message ?? parseErr)}`;
      }
    }
  } catch (err) {
    errorMessage = (err as Error)?.message ?? String(err);
  }

  const payload = {
    relay_url: RELAY_URL,
    relay_token_length: RELAY_TOKEN.length,
    elapsed_ms: Date.now() - startedAt,
    upstream_status: upstreamStatus,
    upstream_headers: upstreamHeaders,
    upstream_body_size: bodySize,
    aircraft_count: aircraftCount,
    first_sample_hex: firstSampleHex,
    error: errorMessage,
    bypass_auth: process.env.BYPASS_AUTH ?? null,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
