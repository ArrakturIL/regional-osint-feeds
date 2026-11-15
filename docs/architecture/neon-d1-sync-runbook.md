# Regional Watch — Neon to Cloudflare D1 collector cache

Status: staged on feature/integrated-data-quality-neon-20261115, NOT ACTIVE IN PRODUCTION.

## Storage and security
GitHub Actions collects public source information, verifies it and writes to Neon PostgreSQL. A source-gated task projects the current fully validated Neon JSON data/status pair into the private Cloudflare D1 database regional-osint. Monitor has a DB binding to this D1; Editor has CORE_DB binding to the same D1. No public page or minute-by-minute Worker polls Neon directly. D1 remains an ephemeral read replica, Neon is the durable snapshot store, and GitHub stays a temporary fallback during cutover.

The additive D1 schema lives at storage/cloudflare/001_regional_collector_cache.sql. scripts/neon_to_d1.py validates Neon JSONB against SHA256 and checked_at; D1 update is an atomic newer-only upsert followed by an independent data/status/digest readback. Missing, corrupted, or divergent data fail closed. Repository code, release logic, tests and docs remain in GitHub.

## Verified credentials and one-off acceptance (15 Nov 2026)
- The GitHub secret CLOUDFLARE_D1_API_TOKEN is configured and independently verified in GitHub Actions with D1 access (run 43719157091). Existing Pages token remains separate.
- Neon to D1 first GDELT backfill succeeded in run 43719275885. The remaining seven source snapshots were synchronized and read back in run 43719906721. All eight cache rows were independently checked via the Cloudflare API.
- A genuinely fresh GDELT export was fetched, normalized, published to Neon and projected into D1 **without any GitHub JSON commit** (run 43720072599). Timestamp 2026-11-15T13:39:17Z; matching hash 7df7557d55f4 from both DBs. Coverage partial: five successful batches, three missing; preserved state=partial. This is not independent corroboration of real-world incidents.
- The one-time acceptance jobs were removed from the ongoing CI workflow after they succeeded; audit their immutable GitHub Actions runs above.
- Regular scheduled collector sync is **not enabled yet**, since the storage workflow changes remain on the feature branch, GitHub Actions variable REGIONAL_NEON_D1_SOURCES is not set, and Worker read feature flags are off.

## Source-by-source rollout, no global switch
1. [DONE] Dedicated D1 token validated; additive table and 8 seed rows verified; fresh GDELT cycle exercised.
2. [NEXT] Observe recurring scheduled writes after the verified storage workflows are introduced to main under the appropriate release gate, keeping GitHub JSON fallback.
3. Select only the first source by setting GitHub Actions variable REGIONAL_NEON_D1_SOURCES to gdelt. Empty/unset means no D1 sync. The eight source workflows all have source-gated sync steps, but existing GitHub writebacks still run.
4. Deploy tested Monitor code with a D1 read feature flag COLLECTOR_CACHE_SOURCES=gdelt only in a controlled QA environment. The adapter verifies SHA256, checked_at and status, and falls back to GitHub on missing, corrupt or stale cache. The production binding is currently unset.
5. Confirm real fresh scheduled updates, time-and-hash parity and failure behavior. Add the other Monitor sources incrementally: marad, centcom, satellite, copernicus, unosat. The two Editor sources, analysts and news_translation, now have a gated CORE_DB reader under backend/editor/src/mirrors/collector-cache.mjs; release/deploy and live reader parity are still pending.
6. Only after server-side read parity, separately disable each corresponding GitHub JSON writeback with an independent confirmed cutover gate. Do not disable eight writebacks in one edit.
7. Roll back reader sources to GitHub by clearing COLLECTOR_CACHE_SOURCES; stop D1 sync by clearing REGIONAL_NEON_D1_SOURCES; preserve Neon and historical GitHub data.

Do not make D1 write calls on shared production/preview DB merely to satisfy UI tests. All Worker read bindings must remain server-only and no browser code may see Neon credentials.

## Evidence
- GitHub private Neon connection verification: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43715836021
- Eight actual source JSONB round trips: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43716247457
- D1 sync module, secure token gate and eight source workflow checks: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43717841032
- Dedicated D1 token verified: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43719157091
- Initial GDELT and remaining seven-source cache writes: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43719275885 and https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43719906721
- Real GDELT fresh cycle (partial coverage, safe attribution): https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43720072599
- Editor cache reader tests and full application check: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43719783495 and https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43719783483

Never claim migration complete while GitHub continues to receive JSON commits.

## Legacy GitHub JSON writeback — safe staged cutover gate

The eight collector workflows now have a second, **independent** GitHub repository Actions variable: `REGIONAL_NEON_PRIMARY_SOURCES`. Default/unset is empty, so every old JSON commit keeps working. This is NOT the same as `REGIONAL_NEON_D1_SOURCES`, which only enables shadow D1 synchronization.

For a source to stop committing JSON, the collector workflow must first have a successful `neon_d1` step. A primary flag alone does not skip GitHub data writes. If its Neon→D1 step fails, `continue-on-error` allows the old GitHub writeback to run; a following diagnostic fails the job so this problem is not silently ignored. This is implemented for gdelt, analysts, centcom, copernicus, marad, satellite, unosat, and news_translation. Existing update consistency/lock logic remains intact.

**Do not set `REGIONAL_NEON_PRIMARY_SOURCES` yet.** Before promoting a source, its Worker read flag must be deployed, reader fallback exercised, several fresh scheduled cycles compared, and QA signed off. `REGIONAL_NEON_PRIMARY_SOURCES` is a commit-suppression flag, not a substitute for data quality validation or backup.

Independent GitHub Actions regression: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43720634079 (test suite green). Current `main` retains all original source writebacks.
