# worldmonitor-de

Dynamic Experts Inc public fork of [WorldMonitor](https://github.com/koala73/worldmonitor).

## License

**AGPL-3.0** (preserved from upstream). All modifications added in this fork are
also licensed AGPL-3.0. See `LICENSE` (inherited from upstream) and `NOTICE`
(modifications list) at the repo root.

## What this fork adds

A single variant + five panels that render Dynamic Experts platform data on the
WorldMonitor 3D globe surface:

| Path | Purpose |
|------|---------|
| `variants/dynamicexperts.com.config.ts` | Variant binding `dynamicexperts.com`, `sudoself.com`, `*.sudoself.com`, `globe.dynamicexperts.com`, `globe.sudoself.com` to the panel set below |
| `panels/dynamic-experts/jet-attribution-panel.tsx` | Beneficial-owner overlay for ADS-B aircraft contacts (calls `/v1/jet/owner-by-icao24/{hex}`) |
| `panels/dynamic-experts/mission-control-panel.tsx` | Compact Platform Status board (calls `/v1/mc/health` + `/v1/mc/intel`) |
| `panels/dynamic-experts/ultracrusty-panel.tsx` | Competitive Intelligence stories + competitor radar (calls `/v1/uc/top-stories` + `/v1/uc/competitors`) |
| `panels/dynamic-experts/war-room-panel.tsx` | Target Board with HQ-pinned competitor markers (calls `/v1/wr/targets` + `/v1/wr/suspects`) |
| `panels/dynamic-experts/magic-rock-highlights-panel.tsx` | Featured-highlights carousel (calls `/v1/mr/highlights`) |
| `lib/dynamic-experts-client.ts` | Typed fetch wrapper + response shapes for the six routes above |

All dynamic data is fetched at runtime from the public, rate-limited, read-only
outbound API at **`https://wm-out.api.sudoself.com`** (Bearer-token auth via the
`NEXT_PUBLIC_DYNAMIC_EXPERTS_API_TOKEN` env var — the token is intentionally
public, scoped read-only by a server-side authorizer, and rate-limited at the
edge).

## Deployed at

- `https://globe.dynamicexperts.com`
- `https://globe.sudoself.com`
- Embedded inside `sudoself.com` Magic Rock surface as an iframe.

## No secrets in source

The fork contains **zero** secrets, customer data, or proprietary business
logic. All response shapes are derived from publicly served API endpoints. See
`AUDIT.md` (staging-only audit performed before publication) for the line-by-line
certification.

## Upstream sync

Stay in lockstep with `koala73/worldmonitor` via standard fork-sync. Our additions
live exclusively under `variants/`, `panels/dynamic-experts/`, and
`lib/dynamic-experts-client.ts` — none of the upstream tree is forked-in-place
modified, so upstream merges are conflict-free.
