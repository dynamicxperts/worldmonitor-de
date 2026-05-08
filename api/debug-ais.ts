// Diagnostic endpoint for the AIS / vessel-snapshot relay path.
//
// Companion to api/debug-mil.ts. The maritime handler at
// server/worldmonitor/maritime/v1/get-vessel-snapshot.ts fetches
// `${WS_RELAY_URL}/ais/snapshot` — when that handler quietly returns
// `undefined` the layer renders zero ships and we have no idea whether the
// relay is unreachable, returning a different shape, or running but in
// "learning" mode with no AIS messages.
//
// This endpoint hits the same URL with the same auth headers and reports:
//   - relay base URL (host only, not the path with secrets)
//   - relay auth header configured (yes/no, never the value)
//   - upstream HTTP status + content-type + body size
//   - parsed top-level keys (so we see "{learning,sampleCount}" vs
//     "{disruptions,density,status}" vs something unexpected)
//   - parsed status block (connected, vessels, messages) when present
//   - per-array counts so we can tell whether the snapshot is structurally
//     valid but empty, vs structurally wrong
//
// Returns the first 800 chars of the body raw when the parse fails, since a
// "learning" payload is small enough to inline and saves a second roundtrip.

export const config = { runtime: 'edge' };

const TIMEOUT_MS = 10_000;

function getRelayBaseUrl(): string | null {
  const raw = process.env.WS_RELAY_URL;
  if (!raw) return null;
  return raw.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/$/, '');
}

function getRelayHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'wm-debug/1.0 (+https://dynamicexperts.com)',
  };
  const secret = process.env.RELAY_SHARED_SECRET;
  if (!secret) return headers;
  const headerName = (process.env.RELAY_AUTH_HEADER || 'x-relay-key').toLowerCase();
  headers[headerName] = secret;
  if (headerName !== 'authorization') {
    headers.Authorization = `Bearer ${secret}`;
  }
  return headers;
}

export default async function handler(_req: Request): Promise<Response> {
  const startedAt = Date.now();
  const baseUrl = getRelayBaseUrl();
  const relayHost = baseUrl ? new URL(baseUrl).host : null;
  const url = baseUrl ? `${baseUrl}/ais/snapshot?candidates=true&tankers=true` : null;
  const hasRelaySecret = Boolean(process.env.RELAY_SHARED_SECRET);

  let upstreamStatus: number | null = null;
  let upstreamHeaders: Record<string, string> | null = null;
  let bodySize: number | null = null;
  let topLevelKeys: string[] | null = null;
  let statusBlock: unknown = null;
  let counts: Record<string, number | null> | null = null;
  let bodySnippet: string | null = null;
  let errorMessage: string | null = null;

  if (!url) {
    return new Response(
      JSON.stringify(
        {
          relay_url: null,
          error: 'WS_RELAY_URL is not configured',
          aisstream_api_key_length: (process.env.AISSTREAM_API_KEY || '').length,
        },
        null,
        2,
      ),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      },
    );
  }

  try {
    const resp = await fetch(url, {
      headers: getRelayHeaders(),
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
        const data = JSON.parse(body) as Record<string, unknown>;
        topLevelKeys = Object.keys(data).sort();
        statusBlock = (data as { status?: unknown }).status ?? null;
        counts = {
          density: Array.isArray((data as { density?: unknown[] }).density)
            ? ((data as { density: unknown[] }).density.length)
            : null,
          disruptions: Array.isArray((data as { disruptions?: unknown[] }).disruptions)
            ? ((data as { disruptions: unknown[] }).disruptions.length)
            : null,
          candidateReports: Array.isArray((data as { candidateReports?: unknown[] }).candidateReports)
            ? ((data as { candidateReports: unknown[] }).candidateReports.length)
            : null,
          tankerReports: Array.isArray((data as { tankerReports?: unknown[] }).tankerReports)
            ? ((data as { tankerReports: unknown[] }).tankerReports.length)
            : null,
        };
      } catch (parseErr) {
        errorMessage = `parse_error: ${String((parseErr as Error)?.message ?? parseErr)}`;
        bodySnippet = body.slice(0, 800);
      }
    } else {
      bodySnippet = body.slice(0, 800);
    }
  } catch (err) {
    errorMessage = (err as Error)?.message ?? String(err);
  }

  const payload = {
    relay_host: relayHost,
    relay_path: '/ais/snapshot?candidates=true&tankers=true',
    has_relay_secret: hasRelaySecret,
    aisstream_api_key_length: (process.env.AISSTREAM_API_KEY || '').length,
    elapsed_ms: Date.now() - startedAt,
    upstream_status: upstreamStatus,
    upstream_headers: upstreamHeaders,
    upstream_body_size: bodySize,
    top_level_keys: topLevelKeys,
    status_block: statusBlock,
    array_counts: counts,
    body_snippet: bodySnippet,
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
