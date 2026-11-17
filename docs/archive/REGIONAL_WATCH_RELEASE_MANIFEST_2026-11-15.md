# REGIONAL WATCH — Release manifest (candidate; NOT CLEARED FOR RELEASE)
**Prepared:** 2026-11-15 (Asia/Jerusalem)  
**Status:** BLOCKED — no production release or migration enabled.  
**Owner:** isolated execution branch `work/regional-watch-execution-20261115`, draft PR #25 into `feature/integrated-data-quality-neon-20261115`.

This file is a release **gate**, not a deploy instruction. The single task queue remains `docs/REGIONAL_WATCH_MASTER_TODO.md`. No API token, connection string, or other credential belongs in this file.

## Baseline pinned by read-only checks
| Layer | Last verified live production version | Evidence |
| --- | --- | --- |
| Pages | `86cd2f80-d892-4eaf-a491-183f86027eb0` (created 2026-11-15 02:25 UTC) | Cloudflare Pages deployments, production only |
| Editor Worker | `ee79d24d-45d3-4170-85d7-1de7f7c74a7c`, 100% | Cloudflare Worker deployments |
| Monitor Worker | `d68c6b6a-137d-4f8b-af41-a1849bdd52c6`, 100% | Cloudflare Worker deployments |
| Main | `8eb9d6a198456130979ae24fffa3fbb1fb1118dc` at initial comparison | GitHub compare; recheck immediately before merging |
| Integrated source | `feature/integrated-data-quality-neon-20261115`; ahead of main by 79 and behind by 10 at branch creation | GitHub compare; NOT fast-forward |
| Isolated QA branch | `work/regional-watch-execution-20261115` | [PR #25](https://github.com/ArrakturIL/regional-osint-feeds/pull/25) |

Historical preview `rw-integrated-preview` is **not** production and shares sensitive bindings. No test database writes through Pages preview.

## Components and rollout controls
| Component | Prepared artifact | Production rollout status |
| --- | --- | --- |
| Pages RU/HE | `frontend/scripts/build-site.mjs`, `backend/pages/src/index.js`; 8 routes | Current base deployed, integration features not released |
| Editor | `backend/editor/src/index.js`, quality guards and D1 mirror adapters | New integrated Worker code **not** deployed |
| Monitor | `backend/monitor/src/index.js`, six gated D1 adapters | New integrated Worker code **not** deployed |
| Neon | `storage/neon/001_collector_snapshots.sql`, 8 stored snapshot pairs | One-off writes proven; recurring shadow/retirement not proven |
| Private D1 | `storage/cloudflare/001_regional_collector_cache.sql`; 8 seed pairs and one live GDELT roundtrip | No regular shadow schedule/cutover enabled |
| GitHub collector workflows | Source-specific fallback gates, no mass switch | Current `main` keeps legacy JSON writebacks |

**Flags:** `REGIONAL_NEON_D1_SOURCES` = unset unless explicitly verified; `REGIONAL_NEON_PRIMARY_SOURCES` = unset; `COLLECTOR_CACHE_SOURCES` = unset in production; `REGIONAL_EDITOR_CACHE_SOURCES` = unset in production. Do not infer live values from documentation: verify configuration read-only before any release.

## Test evidence
- Latest isolated QA branch Node/Pages/Worker CI: [run 43724245898](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43724245898), 10 validation jobs successful; both deploy jobs skipped. Includes RU/HE semantic, news provenance and Python translation mirror checks.
- Python free translation PR CI: [run 43724245865](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43724245865), successful, source snapshot only. Model download, data mirroring, push-to-main and production sync were gated/skipped on PR.
- Previous Neon snapshot read/write and D1 one-off GDELT: [run 43720072599](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43720072599); [run 43719906721](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43719906721).
- Known source data **still wrong in production D1**: tanker English headline/summary → incorrect RU/HE naval mine claims; Reuters may-hold-off conditional; JPost surprise US actor inversion. The branch now quarantines observed bad variants but data corrections/verification and full release gate remain outstanding.

## Hard blockers (do not merge, publish or enable write suppression)
1. Resolve `main` / feature divergence without force pushes or losing ongoing source data commits.
2. Source-verify and safely revise or quarantine the three P1 cached translation records. Keep a reversible before/after D1 audit snapshot and original URLs.
3. Run true RU/HE E2E and read-only preview, including deep links and per-field translation status; verify source links, time semantics, sorted archives and analysis notes.
4. Prove several **distinct** real new collection cycles of all eight sources under shadow, hash and timestamp parity, missing-credential and stale-data fallbacks, and Neon Free quota safety. No D1 cache/primary flag until the previous gate.
5. Release Editor/Monitor/Pages separately with pinned build SHAs and successful regression smoke; Pages preview green never proves Worker runtime was deployed.

## Rollback in case of a later approved rollout
- Read flags: clear `COLLECTOR_CACHE_SOURCES` and `REGIONAL_EDITOR_CACHE_SOURCES` to resume existing GitHub mirror reader; confirm actual fallback/availability first.
- Writes: clear `REGIONAL_NEON_D1_SOURCES` to stop D1 shadow; clear `REGIONAL_NEON_PRIMARY_SOURCES` to retain legacy JSON commits; never zero/delete Neon or D1 rows.
- Restore prior pinned Pages deployment and Worker versions **only after** verifying bindings and the safe rollback procedure. Do not blindly redeploy a stale Worker configuration.
- Keep 8 original GitHub snapshot sources until their individual read and write path is accepted.

## Next action
Follow the current TODO B-01/B-02/P1 truthfulness and D-03/D-04 shadow parity; this release manifest must be refreshed with exact final commit hashes **after** source data QA, not before.
