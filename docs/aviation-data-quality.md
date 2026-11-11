# Aviation coverage and air-corridor context

Regional Watch separates **what a receiver reported** from **what actually happened in the airspace**. This file documents the Cloudflare Worker collectors, not a claim that flight routes have been reconstructed.

## Priority 1: Tehran

- Focus: Tehran, radius 100 nautical miles (NM), using community ADS-B snapshots.
- `adsb.lol`: one request every 15 minutes, alternating Tehran and another regional sector. At most 48 focus + 48 context samples/day, subject to provider availability and backoff.
- AvioADSB: one request every 30 minutes; 32 focus + 16 context samples/day.
- A successful zero-count snapshot is **`zero_in_sample`**, not empty Iranian airspace. An unavailable provider is **`source_unavailable`**; an old or missing Tehran sample is **`no_recent_sample`**.
- Snapshot metadata includes observed aircraft count, type distribution, missing callsign count, database military-flagged count, and transport/tanker type hints. Missing callsigns, aircraft types and database flags **do not prove** government affiliation, intent or military status.
- The authenticated Worker `/summary` exposes `aviation_focus` with explicit status, last sample timestamp, last count, current count only when fresh, and unverified receiver coverage.

## Priority 2: broad US–Europe–Middle East air-corridor context

- `airbridge_context` runs once per hour, rotating six broad areas: eastern North America, western North Atlantic, western Europe, central Europe, eastern Mediterranean and Arabian Gulf.
- Each request is a **single 100 NM snapshot**, not a continuous track. At most 24 requests/day, subject to quota reservation and provider backoff.
- Observations record aircraft counts and **type/database hints only**; no tail numbers, individual paths or precise aircraft positions are stored in this derived source.
- `airlift_type_observed`, `tanker_type_observed`, `military_db_flagged` and `flagged_logistics_type` count matches **within each snapshot**. They are not unique flights or proof of US origin, destination, cargo, deployment, affiliation or a transatlantic air bridge.
- The authenticated `/summary` exposes `airbridge_context.regions` with last snapshot, per-region samples in 24h, and freshness; the UI should label it **«Контекст воздушного коридора»**, never «подтверждённый воздушный мост».
- If AvioADSB reports 28 or fewer remaining requests and the quota information is fresh, the optional corridor sampler skips its turn to preserve capacity for Tehran.

## API budget and attribution

Official provider documentation: https://avioadsb.org/docs/api

- AvioADSB anonymous access: **100 requests/day UTC per network** (IPv4 /24 or IPv6 /64), **1 request/10 seconds**, point radius **at most 100 NM**. A shared Cloudflare egress network can consume quota outside our own requests, so the nominal budget is not a guaranteed allowance.
- Planned Worker usage: **48/day** for Tehran/regional context + **24/day** for the broad corridor = **72/day**, leaving a nominal **28/day** buffer for network sharing and occasional manual tests.
- Rate-limit headers are stored in D1 `worker_provider_quota` when present. The existing `worker_provider_state` lease, Retry-After and exponential backoff prevent simultaneous bursts and repeated 429 retries.
- Attribution: **Data: AvioADSB (CC BY-NC 4.0)** — https://avioadsb.org. Free access is for personal/research and noncommercial use; do not reuse in a commercial product without provider permission.
- The `adsb.lol` and AvioADSB feeds are independent receiver networks, not certified aviation surveillance. Coverage gaps are expected, especially over Iran and open ocean.

## Display rules

1. `aircraft_observed`: show the snapshot count, timestamp, source and 100 NM radius.
2. `zero_in_sample`: show «0 в данном замере», with receiver-coverage caveat.
3. `no_recent_sample`: show «Нет свежего замера» and the last known timestamp; **never reuse a historical zero as current**.
4. `source_unavailable`: show «Источник недоступен» and backoff/health if available.
5. `partial`: explicitly mark coverage incomplete, including unobserved regions.
6. Corridor counts must say «совпадения в отдельных замерах», not «рейсы», «переброски» or «подтверждённые маршруты».

## Verification and rollback

- Staging Worker must compile before deployment.
- Back up the exact production Worker source, preserve its D1 and secret bindings, compatibility date and `*/1 * * * *` cron.
- Verify a real scheduled/manual observation in D1: `source_status`, `observations`, provider quota and cooldown; verify the first *automatic* Tehran focus sample separately.
- On failed verification, restore the backed-up Worker source with original compatibility settings. The optional quota table is additive and harmless if code is rolled back.
- The Pages frontend is deployed separately and must be updated explicitly to consume the new backend fields.
