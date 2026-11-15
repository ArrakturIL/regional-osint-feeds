# Regional Watch — Neon to Cloudflare D1 collector cache

Status: staged on feature/integrated-data-quality-neon-20261115, NOT ACTIVE IN PRODUCTION.

## Storage and security
GitHub Actions collects public source information, verifies it and writes to Neon PostgreSQL. A source-gated task projects the current fully validated Neon JSON data/status pair into the private Cloudflare D1 database regional-osint. Monitor has a DB binding to this D1; Editor has CORE_DB binding to the same D1. No public page or minute-by-minute Worker polls Neon directly. D1 remains an ephemeral read replica, Neon is the durable snapshot store, and GitHub stays a temporary fallback during cutover.

The additive D1 schema lives at storage/cloudflare/001_regional_collector_cache.sql. scripts/neon_to_d1.py validates Neon JSONB against SHA256 and checked_at; D1 update is an atomic newer-only upsert followed by an independent data/status/digest readback. Missing, corrupted, or divergent data fail closed. Repository code, release logic, tests and docs remain in GitHub.

## Confirmed external blocker
The existing GitHub secret CLOUDFLARE_API_TOKEN works for Pages but a real GitHub Actions call to the D1 API returned HTTP 401. It must not receive more permissions. A dedicated Cloudflare API token scoped to this account with Account D1 Edit access must be stored in the GitHub repository Actions secret CLOUDFLARE_D1_API_TOKEN. Never paste tokens or Postgres URLs into chat or source.

Both NEON_DATABASE_URL and CLOUDFLARE_ACCOUNT_ID are already confirmed GitHub Actions secrets. The read-only D1 scope diagnostic safely skips until a dedicated token exists.

## Source-by-source rollout, no global switch
1. Add dedicated CLOUDFLARE_D1_API_TOKEN, validate D1 access read-only in CI.
2. Confirm schema creation is additive; initialize private cache with strict script and verify readback.
3. Select only the first source by setting GitHub Actions variable REGIONAL_NEON_D1_SOURCES to gdelt. Empty/unset means no D1 sync. The eight source workflows all have source-gated sync steps, but existing GitHub writebacks still run.
4. Deploy tested Monitor code with a D1 read feature flag COLLECTOR_CACHE_SOURCES=gdelt only in a controlled QA environment. The adapter verifies SHA256, checked_at and status, and falls back to GitHub on missing, corrupt or stale cache. The production binding is currently unset.
5. Confirm real fresh scheduled updates, time-and-hash parity and failure behavior. Add the other Monitor sources incrementally: marad, centcom, satellite, copernicus, unosat. The two Editor sources, analysts and news_translation, still need their own CORE_DB read adapters before read cutover.
6. Only after server-side read parity, separately disable each corresponding GitHub JSON writeback with an independent confirmed cutover gate. Do not disable eight writebacks in one edit.
7. Roll back reader sources to GitHub by clearing COLLECTOR_CACHE_SOURCES; stop D1 sync by clearing REGIONAL_NEON_D1_SOURCES; preserve Neon and historical GitHub data.

Do not make D1 write calls on shared production/preview DB merely to satisfy UI tests. All Worker read bindings must remain server-only and no browser code may see Neon credentials.

## Evidence
- GitHub private Neon connection verification: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43715836021
- Eight actual source JSONB round trips: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43716247457
- D1 sync module, secure token gate and eight source workflow checks: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43717841032
- Live D1 API token test: HTTP 401 with the existing Pages token; use a different scoped D1 token.

Never claim migration complete while GitHub continues to receive JSON commits.
