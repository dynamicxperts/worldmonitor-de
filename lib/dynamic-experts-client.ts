/**
 * Dynamic Experts outbound API client.
 *
 * Part of the AGPL-3.0-licensed worldmonitor-de public fork.
 * No secrets. No proprietary logic. The token below is a PUBLIC,
 * read-only, rate-limited Bearer scoped by a server-side Lambda
 * authorizer + WAF behind the API Gateway — leaking it is harmless.
 *
 * Base URL is overridable via VITE_DYNAMIC_EXPERTS_API_BASE
 * (defaults to https://wm-out.api.sudoself.com).
 *
 * All response types mirror the public, white-labeled JSON shape
 * returned by the outbound API.
 *
 * Upstream WorldMonitor is a Vite project (not Next.js) — Vite only
 * exposes import.meta.env.VITE_* to client code. process.env.* would
 * compile to undefined and silently 401 every API call.
 */

const VITE_ENV = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

const API_BASE =
  VITE_ENV.VITE_DYNAMIC_EXPERTS_API_BASE ??
  "https://wm-out.api.sudoself.com";

const API_TOKEN = VITE_ENV.VITE_DYNAMIC_EXPERTS_API_TOKEN ?? "";

const DEFAULT_TIMEOUT_MS = 5000;

// ---------- Response shapes (public, white-labeled) ----------

export interface JetOwnerResponse {
  icao24: string;
  tail: string | null;
  owner_name: string | null;
  owner_type: string | null;
  confidence: string;
  model: string | null;
  year: number | null;
  updated_at: string | null;
}

export interface MissionControlSubsystem {
  subsystem: string;
  status: "healthy" | "degraded" | "warning" | "critical" | "down" | "unknown";
  metrics: Record<string, unknown>;
  as_of: string | null;
}

export interface MissionControlHealthResponse {
  overall: "healthy" | "degraded" | "critical";
  subsystems: MissionControlSubsystem[];
}

export interface IntelReport {
  id: string;
  report_type: string | null;
  severity: "critical" | "high" | "medium" | "low";
  title: string | null;
  summary: string | null;
  created_at: string | null;
  source: string;
}

export interface IntelListResponse {
  items: IntelReport[];
  count: number;
}

export interface UltracrustyStory {
  id: string | null;
  title: string | null;
  summary: string | null;
  url: string | null;
  source: string | null;
  momentum: number | null;
  published_at: string | null;
}

export interface UltracrustyStoriesResponse {
  items: UltracrustyStory[];
  count: number;
}

export interface UltracrustyCompetitor {
  id: string | null;
  name: string | null;
  domain: string | null;
  hq_country: string | null;
  hq_lat: number | null;
  hq_lon: number | null;
  discovered_at: string | null;
}

export interface UltracrustyCompetitorsResponse {
  items: UltracrustyCompetitor[];
  count: number;
}

export interface WarRoomTarget {
  id: string | null;
  name: string | null;
  hq_country: string | null;
  hq_lat: number | null;
  hq_lon: number | null;
  status: string;
  last_activity_at: string | null;
  deep_link: string | null;
}

export interface WarRoomTargetsResponse {
  items: WarRoomTarget[];
}

export interface MagicRockHighlight {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  link?: string;
  publishedAt?: string;
}

export interface MagicRockHighlightsResponse {
  items: MagicRockHighlight[];
}

// ---------- Generic fetch ----------

class DynamicExpertsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
  ) {
    super(message);
    this.name = "DynamicExpertsApiError";
  }
}

async function getJson<T>(path: string, query?: Record<string, string>): Promise<T> {
  const qs = query
    ? "?" +
      new URLSearchParams(query as Record<string, string>).toString()
    : "";
  const url = `${API_BASE}${path}${qs}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (API_TOKEN) {
    headers["Authorization"] = `Bearer ${API_TOKEN}`;
  }

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new DynamicExpertsApiError(
        `Request failed: ${resp.status}`,
        resp.status,
        path,
      );
    }
    return (await resp.json()) as T;
  } catch (err) {
    if (err instanceof DynamicExpertsApiError) throw err;
    if ((err as Error).name === "AbortError") {
      throw new DynamicExpertsApiError("Request timeout", 504, path);
    }
    throw new DynamicExpertsApiError(
      `Request error: ${(err as Error).message}`,
      0,
      path,
    );
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Public API ----------

export const dynamicExpertsClient = {
  async getJetOwner(icao24: string): Promise<JetOwnerResponse | null> {
    try {
      return await getJson<JetOwnerResponse>(
        `/v1/jet/owner-by-icao24/${encodeURIComponent(icao24)}`,
      );
    } catch (err) {
      if (err instanceof DynamicExpertsApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  },

  getMissionControlHealth(): Promise<MissionControlHealthResponse> {
    return getJson<MissionControlHealthResponse>("/v1/mc/health");
  },

  getMissionControlIntel(
    severity: "critical" | "high" | "medium" | "low" = "high",
    limit = 25,
  ): Promise<IntelListResponse> {
    return getJson<IntelListResponse>("/v1/mc/intel", {
      severity,
      limit: String(limit),
    });
  },

  getUltracrustyTopStories(limit = 20): Promise<UltracrustyStoriesResponse> {
    return getJson<UltracrustyStoriesResponse>("/v1/uc/top-stories", {
      limit: String(limit),
    });
  },

  getUltracrustyCompetitors(limit = 20): Promise<UltracrustyCompetitorsResponse> {
    return getJson<UltracrustyCompetitorsResponse>("/v1/uc/competitors", {
      limit: String(limit),
    });
  },

  getWarRoomTargets(): Promise<WarRoomTargetsResponse> {
    return getJson<WarRoomTargetsResponse>("/v1/wr/targets");
  },

  getWarRoomSuspects(screened = true): Promise<WarRoomTargetsResponse> {
    return getJson<WarRoomTargetsResponse>("/v1/wr/suspects", {
      screened: String(screened),
    });
  },

  getMagicRockHighlights(): Promise<MagicRockHighlightsResponse> {
    return getJson<MagicRockHighlightsResponse>("/v1/mr/highlights");
  },
};

export { DynamicExpertsApiError };
