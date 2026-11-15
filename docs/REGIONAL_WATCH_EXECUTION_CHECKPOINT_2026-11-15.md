# REGIONAL WATCH — execution checkpoint (15 November 2026, Asia/Jerusalem)

## Working state
- User authorised starting the unified TODO, with explicit instruction to preserve work and end safely on transport failures.
- Work is isolated in branch `work/regional-watch-execution-20261115`, forked from `feature/integrated-data-quality-neon-20261115`; **do not push to main, merge, deploy Workers, change D1/Neon, or flip cutover flags** without test gates and a deliberate release step.
- Canonical TODO: `docs/REGIONAL_WATCH_MASTER_TODO.md` on the parent feature branch; original QA, Neon runbook, and OSS research are reference documents.
- Parent feature branch previously diverged from `main` (79 ahead / 10 behind after TODO commit); this is not a merge-ready fast-forward.
- Existing schema and live Neon/D1 one-off checks were completed in previous session. The current session must not rerun writes just to reproduce those steps.
- Local container cannot resolve github.com, so source of truth and commits go through connected GitHub; no full local clone. GitHub CI and narrow in-memory tests should be used as available.
- Existing baseline tests in `tests/architecture/translation-semantics.test.mjs` and `tests/architecture/news-localization-provenance.test.mjs` cover a class of mine collision errors, but the Russian present-tense `нападают` from production QA appears missing in JavaScript semantic guards.

## Next checked task
1. B-01/B-02: add explicit regression for source `Two tankers strike a naval mine...` against mistranslation `Два танкера нападают на мины`, including safe accurate counterexample and direct localizeNewsRow contract.
2. Reproduce RED on the unmodified semantic guard, fix smallest root cause, verify GREEN and no false positive on labor action; run broader CI if possible.
3. Update this checkpoint with exact commit IDs, tests, and any remaining block. Then continue A-02/translation source parity and stage read-only checks, preserving production.

## Safety if session interrupts
- Last trustworthy durable record is this file **plus actual Git commits**, not transient chat output.
- On resumed session check the work branch HEAD, read latest section of this checkpoint, inspect the diff/CI. Never redo committed work or infer completion from intent.
- Mark incomplete tests/features `in progress`; do not claim deployed or corrected production data without corresponding read-only verification.

## Verified execution milestone — 15 Nov 2026, following PR #25

**Isolated branch:** `work/regional-watch-execution-20261115`; draft pull request https://github.com/ArrakturIL/regional-osint-feeds/pull/25 targets the parent feature branch, **not main**. It has not been merged.

### A-02 read-only baseline
- `main` HEAD observed by GitHub comparison before this work: `8eb9d6a198456130979ae24fffa3fbb1fb1118dc`. Parent feature branch before this work: 79 ahead / 10 behind main; recheck these figures before any merge.
- Cloudflare Pages production, read-only query: `86cd2f80-d892-4eaf-a491-183f86027eb0` (15 Nov 02:25 UTC); later preview deployments belong to `rw-integrated-preview`, do **not** confuse them with production.
- Cloudflare Editor 100% version `ee79d24d-45d3-4170-85d7-1de7f7c74a7c`; Monitor 100% version `d68c6b6a-137d-4f8b-af41-a1849bdd52c6`.
- D1 database `regional-watch-news` was queried with SELECT only. No rows written, no source removed, no secret logged.

### B-01/B-02 exact current production observations (read-only)
- News ID `67d535234b8e4179f9401a71`: original English title `Two tankers strike mines in Strait of Hormuz`; bad Russian title `Два танкера нападают на мины в Хормузском проливе`; original summary says caught fire `after striking a naval mine`, while RU summary incorrectly describes shelling and a naval mining facility. HE cache also contains `מכרות`/`מכרה` (mining facilities).
- News ID `da4c4535478a60f9b3975e40`: original Reuters/JPost title `Trump tells advisers he may hold off on Iran attacks barring new provocations`; RU/HE cached titles retain broken causal condition; quality guard must present `needs_review` until a source-verified replacement.
- News ID `9fc41a45cd3dde0e911c3773`, JPost article-914880: cached Hebrew title reverses who would surprise whom, while English source fears a US strike.
- **The corrupted live D1 rows were NOT changed**. Do not mark B-01 complete merely because the feature-level guard is green; full release requires controlled retranslation/quarantine and API verification.

### Actual code + TDD
- `tests/architecture/translation-semantics.test.mjs`: new red cases for `нападают`, `תוקפות`, exact live Hormuz headline (without "naval"), and source summary "after striking". `tests/architecture/news-localization-provenance.test.mjs`: explicit `needs_review` and original English fallback.
- `backend/editor/src/translations/semantic-meaning.mjs`: scoped vessel+maritime context classifier, present-tense attack detection and gerund `striking`; normal mineral mining/labor actions remain allowed. The initial live-string test failed before implementing, passed after correction.
- `.github/workflows/regional-watch-app-check.yml`: explicit semantic/provenance tests in Editor job, independent of specialized storage CI.
- Dedicated `.github/workflows/regional-watch-safe-check.yml` has **no secret use, deploy or D1 mutations**; intended as isolated branch offline CI.
- GitHub PR CI run 43723534426 SUCCESS, 10 source/build jobs green; preview and production deploy jobs SKIPPED. Latest run **43723810921** SUCCESS, 10 source/build jobs green; preview and production jobs SKIPPED. https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43723810921

### Safe continuation
1. Check PR #25 and the latest branch HEAD, verify current CI and confirm no other agent changed parent/main. **Never repeat already committed TDD patches.**
2. Continue B-01 quality gate on exact D1 records with safe read-only checks, then plan source-verified RU/HE corrections and a reversible data update gated by release approval. Production currently still has the erroneous cached rows.
3. Build A-03 release manifest and complete D-03/D-04 shadow-read parity without changing shared production until appropriate gates.
4. Keep the unified TODO updated with evidence; if transport fails, this checkpoint is the durable resumption location.

**Important:** User specifically asked that any transport interruption lead to checkpointing and safe termination, not endless retry loops or a claim that the session will automatically resume.

## Follow-on milestone — Python/JS parity, docs and clean CI (15 Nov 2026)

- Found a second exact P1 hole: Reuters `may hold off` did not match `may (postpone|delay|defer)` in either JavaScript or Python semantic gates, so an erroneous *completed decision* with a correctly translated `barring` clause could pass.
- RED: isolated GitHub Actions `43724206408` Python translation job **failed as expected** after adding the regression, and the `editor-source` Python step in `43724206435` also failed. Test failure was from the new actual-source fixture; the model-download/production-publishing steps were skipped on PR.
- GREEN: updated `backend/editor/src/translations/semantic-meaning.mjs` and `scripts/translation_semantics.py` to recognize `may|might|could + postpone|delay|defer|hold off`. The four RU/HE new variants (bad/good) pass; the naval-mine and non-mine cases still pass.
- CI confirmed: [full application 43724245898](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43724245898) **all 10 validation jobs successful**, both deploy jobs SKIPPED. [Open-source translation 43724245865](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43724245865) SUCCESS, with PR-only safe tests and no model install/data publish.
- The temporary `.github/workflows/regional-watch-safe-check.yml` was intentionally **removed**, to avoid duplicating GitHub Actions cost. The normal app workflow now executes both JS and Python high-impact translation tests on PRs.
- Prepared `docs/REGIONAL_WATCH_RELEASE_MANIFEST_2026-11-15.md`, status BLOCKED, with pinned live Pages/Editor/Monitor versions, source flags and rollback.
- Updated the **single** `docs/REGIONAL_WATCH_MASTER_TODO.md` on the isolated branch with actual progress; also updated the same TODO in personal Library `Regional Watch / 00_CURRENT`. No second plan was created.

**Safe resumption:** read PR #25 HEAD, this final milestone and master TODO. Production D1 still has corrupted examples and has not been changed. The next uncompleted gate is source-backed correction/quarantine with reversible D1 snapshot, plus read-only preview/Neon shadow parity. Never skip QA or mark B-01, D-04, D-05 completed on CI-only evidence.

## Final safe handoff — D1/GitHub shadow-read audit and tooling (15 November 2026)

- All eight private D1 cache rows in Cloudflare `regional-osint.regional_collector_cache` were inspected through **read-only SELECT**. Canonical SHA-256 of both actual `data_json` and `status_json`, and `checked_at_ms` vs embedded checked_at, **matched 8/8**; SQL `rows_written=0`. This verifies **integrity**, NOT regular freshness.
- Compared against real GitHub main public collector snapshots: `analysts` 12.47 hours behind, `centcom` 16.13 hours behind, `copernicus` 8.07h behind, `marad` 13.35h behind, `news_translation` 8.08h behind, `unosat` 12.53h behind. D1 `gdelt` was 3.87h **newer** than main because of its proven controlled one-off collection. `satellite` matched GitHub but its original source timestamp is 2026-11-12 11:08 UTC (stale >72h at audit).
- **D-04 remains BLOCKED:** six stale mirrors; ordinary scheduled GitHub collectors are not proving recurring Neon→D1 delivery, feature read flags remain OFF. Source 72h stale sentinel must not be confused with healthy current coverage.
- Durable QA evidence: [full D1 shadow audit](https://github.com/ArrakturIL/regional-osint-feeds/blob/work/regional-watch-execution-20261115/docs/qa/REGIONAL_WATCH_D1_SHADOW_AUDIT_2026-11-15.md).
- Added **read-only executable audit** `scripts/audit_collector_cache.py` using existing bounded contract and D1 REST client. Reports `matched|cache_behind|cache_ahead|equal_time_conflict|invalid_cache|missing_cache`, requires environment-provided D1 credential, prints metadata only, no INSERT/UPDATE/DELETE, exits nonzero on drift. **Never run per-user website view or on a minute cron**.
- Added eight offline regression tests `scripts/test_audit_collector_cache.py`; TDD red observed [CI 43724827233](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43724827233) editor-source missing module; then module implemented; [CI 43724933138](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43724933138) all ten source/build validation jobs SUCCESS, deploy jobs SKIPPED. App workflow detects audit script changes.
- Updated single `docs/REGIONAL_WATCH_MASTER_TODO.md` on working branch AND personal Library `/Regional Watch/00_CURRENT/REGIONAL_WATCH_MASTER_TODO_2026-11-15.md` with this result.
- Production `main`, Pages `86cd2f80`, Editor `ee79d24d`, Monitor `d68c6b6a`, Neon rows, D1 rows, Cloudflare env bindings, and release flags were **not changed**. All mutations were GitHub commits to the isolated work branch, plus saved Library TODO.

**Safe continuation after a connection loss:** check the latest head of `work/regional-watch-execution-20261115`, draft PR #25, and this checkpoint plus the audit doc before executing anything. Do not redo either translator TDD or D1 parity diagnostic; do not assume the current D1 drift persists forever without another SELECT. Priority next: source-verified P1 cached translation repair with reversible backup, isolated true RU/HE QA, and recurring shadow sync validation; only then consider reading from D1 per collector or stopping GitHub JSON updates.

## Source-backed P1 remediation candidates and safe stop (15 November 2026)

- **Primary source confirmation:** Israel National News `/news/436187` says two tankers reportedly hit a naval mine and caught fire, attribution Iranian Navy, not independently verified; Reuters reprinted JPost `article-914862` says Trump **may** refrain from US strikes **on Iran if** no new provocations, an undecided conditional report; JPost analysis `article-914880` says Israel fears surprise **US** strikes against Iran, not Israel surprising the USA.
- Created strictly **review-only** `data/qa/p1-translation-remediation-20261115.json` with exact original titles/summaries, known-bad RU/HE (where verifiable) and proposed meaningful RU/HE replacements; it is *NOT* a D1 repair executable and has no auto-publish path.
- New test in `tests/architecture/news-localization-provenance.test.mjs` verifies 3 unique source IDs/URLs, proposed RU/HE title/body pass semantic guards, and every explicitly listed corrupted field is rejected.
- Discovered further guard bug: `/(מכרות|מכרה\\b)/` failed on real HE summary `מכרה ימי` because JavaScript `\\b` does not recognize Hebrew as word characters. Corrected a narrow contextual rule in `backend/editor/src/translations/semantic-meaning.mjs`; independent JS test against live cache phrase confirmed previously null, now `naval_mine_misread`. Correct paraphrases remain accepted.
- [CI 43725555347](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43725555347): 10/10 code/build jobs SUCCESS including semantic/provenance fixtures; preview+production deploy jobs SKIPPED. The accompanying translation workflow was PR-safe and does not mirror data/write main.
- Source-based remediations are described in `docs/qa/REGIONAL_WATCH_P1_TRANSLATION_REMEDIATION_2026-11-15.md`: confirmed preflight, immutable backup, old HE quarantine, two RU corrections, HE pending until QA, preview/API test, rollback. **No production D1 mutations** during this session. The fix remains a release blocker until actually verified and applied under proper gates.
- Updated the single master TODO again on this branch. Work branch remains a draft [PR #25](https://github.com/ArrakturIL/regional-osint-feeds/pull/25) targeting integrated feature, not main.

**Latest safe recovery point:** check branch HEAD (last documentation update `0d6bb49ce92b09a00bf021b237c58358526b5f23` before this checkpoint commit), CI 43725555347, read `docs/REGIONAL_WATCH_MASTER_TODO.md`, this checkpoint, P1 remediation runbook and D1 shadow audit. Do NOT redo completed regressions, never infer a released patch from a passed unit test, and do not turn on production source flags while the D1 freshness drift persists. This session is intentionally ending at a safe, fully checkpointed boundary rather than running unbounded retries.

## 2026-11-15 19:09 IL — user approved continuation, pre-mutation checkpoint
- User explicitly replied «Одобрен. Продолжай» after reviewing the canonical TODO and source-backed P1 translation remediation. Continue the controlled B-01/B-02 process, with an audit backup and rollback gate; no broad main release or Neon cutover implied.
- PR #25 head at session start `a572d14a21f20896875695dac624aef178ce0472`, draft; `main...work` compare: 113 ahead / 11 behind. **Do not merge divergent branches**.
- Cloudflare read-only SELECT 2026-11-15: all three affected `news_items` and HE `regional_i18n` values still match recorded manifest. No new translation overwrite. Two RU rows are wrong; JPost 914880 RU already correctly describes the US actor.
- Cloudflare D1 `regional-watch-news` **Time Travel bookmark before any planned data writes**: `000004eb-00000000-00005124-0cd33bdf8a17b42c13f6a5aced505b2d`. This is a whole-DB emergency bookmark, **not** a safe routine rollback, because restoring it would also discard unrelated later database changes. Per-record backup is still required before writes.
- Investigated Writer pipeline: `backend/editor/src/translations/news-mirror.mjs` only updates RU when `headline_ru IS NULL`, and `backend/editor/src/index.js` uses `COALESCE(headline_ru,?)`; existing non-null corrections will not be automatically overwritten by these two paths. HE mirror ON CONFLICT only updates when the `source_hash` changes, so manually approved HE corrections need correct new fingerprints. Feature read flag remains OFF.
- Next: implement and verify transactionally guarded record backup + P1 patch with offline tests, then compare current stored records and only apply exact, reversible, data-limited changes, read back and save rollback metadata. Avoid unsafe whole-DB Time Travel restore.

## 2026-11-15 ~19:18 IL — durable selective D1 backup verified, before patch
- Cloudflare D1 production `regional-watch-news` contains new **backup-only** table `regional_translation_repair_backups`, schema committed at `storage/cloudflare/002_p1_translation_repair_backups.sql` and capture at `storage/cloudflare/003_p1_translation_backup_capture.sql`. Both immutable UPDATE and DELETE abort triggers are present.
- Batch ID: `rw_p1_20261115_userapproved_1909`; captured_at_ms `1794763123421`; three backup insertions were each 1 change, 2 D1 rows-written accounting; 3/3 backups read back with all 13 news fields and 10 HE fields, exact live original RU and HE data/hashes matched. The batch is private in D1; no original row data was copied to public GitHub.
- D1 Time Travel bookmark **before backup creation**: `000004eb-00000000-00005124-0cd33bdf8a17b42c13f6a5aced505b2d`. Never restore whole DB to rollback routine translation edits.
- Tested with offline SQLite `scripts/test_p1_backup_contract.py` in [GitHub app CI 43740253872](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43740253872), Editor job passed, all source-build validators nearly completed; check final CI. Test covers exact backup data, immutable triggers, no HE source.
- **Critical resumption invariant:** Original bad RU and HE fields are STILL LIVE at this checkpoint; no production translations changed yet. On interruption do not reinsert backup batch (duplicate triggers are intentionally strict). First verify existing 3 immutable copies by SELECT, then decide if target rows have already been patched or not.
- Source cross-check via original INN/Reuters/JPost online publications independently confirmed attribution and uncertainty, not just cached headlines.

## 2026-11-15 — GLOBAL ARCHITECTURE PRIORITY OVERRIDE (user instruction)

**Binding user decision:** stop spending time on individual site content/translation defects; prioritize complete integrated architecture and end-to-end operation first: modular GitHub architecture, Cloudflare Pages+Editor+Monitor+D1, Neon shadow snapshots, collector schedules, connectors, safe staged release. Existing P1 translation cases remain in the master TODO for later; do NOT do any new per-article D1 edits.

**State on interruption:** D1 `regional-watch-news` contains a verified immutable three-row backup batch `rw_p1_20261115_userapproved_1909`; actual news/HE rows were not changed by this work (verify with SELECT if uncertain). Do not create further backup or apply correction from the paused per-article work. `PR #25` remains draft and unmerged.

**Architectural gap confirmed:** `scripts/publish_neon_mirror.py` and `scripts/neon_to_d1.py` implement validated source snapshots; Monitor and Editor have gated D1 fallback readers, but all eight-source sync remains opt-in/not regularly scheduled on main, and the feature branch diverges from data-updated main. No cutover flags to disable legacy commits yet. Safest next path: a bounded single scheduled **shadow-only Neon→D1 maintenance workflow** which reads eight existing GitHub JSON pairs, handles missing credentials/errors fail-closed, and leaves old main JSON writers operational; validate on isolated branch; then preview and progressive release with explicit checks. Do not make Neon Free compute wake per-minute.

**Global execution gates:** 1) full topology/versions/bindings audit, 2) shadow sync CI TDD, 3) preview Pages+read-only API/Worker cross-check, 4) reconcile main safely, 5) production deployment of modules, 6) verify repeated scheduled shadow and per-source D1 read fallback, 7) only then retire old JSON writebacks. Pin exact commits; checkpoint before any external mutation.

## 2026-11-15 ~19:43 IL — GLOBAL ARCHITECTURE MERGED TO MAIN (authoritative)

User explicitly reprioritized to GLOBAL migration over individual article corrections. No per-article translation content was updated. D1 contains an immutable three-article original backup from the previously approved P1 work, but published rows remain unchanged pending future QA.

- **Global release PR:** [#26](https://github.com/ArrakturIL/regional-osint-feeds/pull/26) MERGED with merge SHA `b820ce9792d8dac73395e5ea425ec4050bcf87ef`. The source release SHA was `d85e889358ec806ff080242c798930bc064f8af9`. GitHub confirmed 12 diverged data-only main paths and zero overlap with 81 integration paths before merge; merge preserved concurrent main JSON. Main continues receiving new bot commits, so recheck latest SHA rather than freeze b820 as current head.
- **Staged Pages preview:** `rw-architecture-preview`; deployment `af96759b-b944-401e-b6a4-4f274a6b4edb` and [app CI 43741996274](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43741996274), 10/10 code validation jobs, preview Pages static and live RU/HE API wiring smoke SUCCESS. Preview is linked to EXISTING production Editor/Monitor services and D1, not the staged modular Worker bundle.
- **Global CI before merge:** [integrated Neon/D1 checks 43741996205](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43741996205), [live existing site smoke 43741996298](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43741996298), plus analyst, UNOSAT, Copernicus and free translation jobs all SUCCESS on the release head.
- **Production Pages Cloudflare observed:** new production Pages deployment `e3b5fa72-085d-4a98-973c-4248892b773b` at `2026-11-15T17:39:31Z`, stage `success`, replacing prior `86cd2f80-d892-4eaf-a491-183f86027eb0`. Cloudflare deployment API reports `ad_hoc` with empty commit hash; source association must be independently established from GitHub CI logs before claiming exact Pages SHA. The Pages preview has been tested with real API; don't conflate with new modular Workers.
- **Active planned sync:** `.github/workflows/collector-shadow-sync.yml` is now present in `main`: cron `23 */2 * * *` UTC, GitHub Actions main only, 8 collector JSON pairs prevalidated, single Neon transaction then D1 mirroring/readback, no GitHub push, no source flags. This is now configured, BUT no recurring completed run has yet been directly observed in this session. Wait for recorded GitHub Actions run or verify private D1/Neon read-only before calling recurrent delivery operational.
- **Production Worker code deployment NOT done:** existing Cloudflare settings: Editor `regional-watch-editor` has AI, CORE_DB and NEWS_DB, cron `*/5 * * * *`; Monitor `regional-osint-monitor` has DB, secrets AIS_KEY/FIRMS_KEY/GFW_API_TOKEN/SUMMARY_TOKEN, REGION plain text `{\"marine\":[47,22,61,31]}`, cron `*/1 * * * *`; compatibility date `2026-11-10`. Keep all secret bindings, AI, D1, plain config and crons on any further Worker code deploy. Preview shares production service/D1 bindings; do not use preview to conduct writes.
- **Do NOT enable** `COLLECTOR_CACHE_SOURCES`, `REGIONAL_EDITOR_CACHE_SOURCES`, `REGIONAL_NEON_PRIMARY_SOURCES` until multiple fresh verified shadow cycles and actual modular Worker read fallback QA. All legacy GitHub JSON jobs remain active. No force-push or bulk delete.

**Next action:** assess production Pages live smoke and actual shadow schedule; stage/test modular Worker bundle versions before deploying Editor/Monitor to production, preserving binding inventory. Then source-by-source Reader D1 cutover and finally writeback retirement. On transport failure, verify main merge SHA, new Pages deployment and this checkpoint rather than repeat PR merge or earlier data backups.

## 2026-11-15 ~19:50 IL — production Pages verified, Worker QA blocked by scoped token (safe stop)

**Global architecture user priority unchanged:** full integration and end-to-end operations first; individual RU/HE P1 news corrections deferred. Canonical progress now at `docs/REGIONAL_WATCH_MASTER_TODO.md` in main section `GLOBAL-01…09` (commit `ed11451689c2e8e657af05499ae466288bd859bb`).

- Main merge commit `b820ce9792d8dac73395e5ea425ec4050bcf87ef`; GitHub main continues with bot data JSON commits. Pages production at Cloudflare deployment `e3b5fa72-085d-4a98-973c-4248892b773b`; preview `rw-architecture-preview` `af96759b-b944-401e-b6a4-4f274a6b4edb`. Preview API and routes green (GitHub run 43741996274) but its service bindings still point to OLD production Workers.
- New QA Worker branch `infra/regional-watch-workers-20261115`, draft [PR #27](https://github.com/ArrakturIL/regional-osint-feeds/pull/27), started from main after #26. Two QA Worker configs have `workers_dev:false`, no routes and no cron; Editor binds AI, CORE_DB and NEWS_DB; Monitor binds DB and REGION, no prod secrets/cron. Bundles and runtime static tests passed in staging job.
- **Root cause of failure:** Existing `secrets.CLOUDFLARE_API_TOKEN` works for Pages but returns Cloudflare `No access to the specified resource` on `/workers/scripts/regional-watch-editor-architecture-qa/secrets` (GitHub staging run 43742875976). This is Cloudflare API permission failure, NOT a bundle error. The next CI revision `aca715e941d0f063d50c72aa502fa5caab3e42cc` references a dedicated `CLOUDFLARE_WORKERS_API_TOKEN` and stops before any API calls if absent (run 43743277284 failed at credentials check, expected). **Do not retry with the Pages token.**
- Required user-side credential for continuing Worker QA deployment: Cloudflare API token with Workers Scripts Edit scope for target account saved in GitHub Actions repository secret `CLOUDFLARE_WORKERS_API_TOKEN` (token value must NOT be sent through chat or committed). After configured, rerun trusted PR #27 staging. Retain existing production Editor/Monitor D1/AI/secrets/REGION/cron. Production Workers NEVER changed in this phase.
- Independent **read-only Neon SQL** verified 8 snapshots current near 2026-11-15 17:39Z (news_translation 17:41Z), but **read-only D1 SQL** still found original 8 seeded timestamps/synced times. Therefore collector shadow path is still not live-verified; don't set reader/primary flags. `collector-shadow-sync.yml` exists in main with UTC schedule `23 */2 * * *`, first real success pending a recorded Actions run. Neon and D1 statements were read-only, no content edits.
- `docs/REGIONAL_WATCH_MASTER_TODO.md` in main now explicitly reprioritizes global actions and records exact blockers and checklist. Library copy may lag GitHub; GitHub main file is authoritative.

**Safe resume if connection drops:** 1) read main master TODO and this checkpoint, 2) inspect PR #27 HEAD and Cloudflare Workers script deployment metadata, 3) verify whether `CLOUDFLARE_WORKERS_API_TOKEN` is configured by staging logs (never read/show secret), 4) inspect latest collector-shadow-sync main run and D1/Neon parity, 5) continue safe QA Worker deploy, production rollout and source-by-source cutover. Do not remerge #26, redo D1 P1 backup, disable legacy JSON prematurely, or write to any published news records.

### Дополнение к проверке ~19:50 IL — безопасное подтверждение границы
- CI PR #27 current head `aca715e941d0f063d50c72aa502fa5caab3e42cc`: app tests [43743277958](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43743277958) SUCCESS; private Worker staging [43743277284](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43743277284) deliberately FAILS before deployment due missing `CLOUDFLARE_WORKERS_API_TOKEN`. No retry loop, no secret exposure.
- Cloudflare real deployment metadata rechecked: production Editor 100% `ee79d24d-45d3-4170-85d7-1de7f7c74a7c` (14 Nov), production Monitor 100% `d68c6b6a-137d-4f8b-af41-a1849bdd52c6` (13 Nov). No matching QA Worker deployment records observed. Thus **DO NOT claim production modular Worker rollout or successful QA Worker staging**.
- Do not modify `main` Worker scripts or source flags until scoped token has been added and trusted PR#27 staging actually works. Existing live Pages stays published; 8 source fallback remains GitHub JSON.


## 2026-11-15 ~18:23 UTC — PRIORITY: STOP RECURRING GITHUB DATA COMMITS

Binding user instruction: remove eight automated source JSON pushes to `main` **without breaking updates**. Do not repeat main branch reconciliation or redo known integration.

- **New modular Workers deployed to production through connected Cloudflare API**, bypassing a GitHub Actions deploy token that had 403 on Worker secrets. Original deployed production versions were Editor `ee79d24d-45d3-4170-85d7-1de7f7c74a7c` and Monitor `d68c6b6a-137d-4f8b-af41-a1849bdd52c6`; retain these for emergency rollback.
- **Editor active version**: `caf89c4f-acbd-46c9-ab75-6998a8a9d689`, bindings AI, CORE_DB, NEWS_DB and plain `REGIONAL_EDITOR_CACHE_SOURCES=analysts,news_translation`, cron `*/5 * * * *`.
- **Monitor active version**: `8f6128e4-07ff-4464-b0d2-d0e7095ab8b9`, bindings DB, REGION, secrets AIS_KEY, FIRMS_KEY, GFW_API_TOKEN, SUMMARY_TOKEN and `COLLECTOR_CACHE_SOURCES=gdelt,centcom,marad,copernicus,satellite,unosat`; cron `*/1 * * * *`.
- Staging QA Worker versions uploaded and deployed with no public workers.dev/previews and **zero cron**, after live inventory and D1 binding parity; QA names `regional-watch-editor-architecture-qa` and `regional-osint-monitor-architecture-qa`. DO NOT delete until release accepted.
- Shadow bootstrap ran on isolated branch `fix/collector-storage-cutover-20261115`, updating **8/8** D1 cache rows. Independent Neon/D1 readback **all eight SHA-256 pairs equal**. Timestamp ms differences from PostgreSQL sub-ms conversions were within 1ms. Last readback sync marker `1794765625176` (2026-11-15 18:00:25 UTC). This proves a single real source replication but NOT multiple main-cron runs.
- D1 manual monitored canary `rw-cutover-gdelt-context-canary-20261115`: `gdelt_context` state OK, no rejection; earlier invalid `gdelt` manual request completed with empty requested sources and is NOT evidence.
- D1 manual `rw-cutover-centcom-marad-20261115`: `centcom_dvids` and `marad_official` both OK, zero rejected.
- D1 manual `rw-cutover-copernicus-satellite-unosat-20261115`: `copernicus_ems` PARTIAL (proper source caveat), `satellite_context` PARTIAL (proper source caveat), `unosat_analysis` OK; no rejected/missing secrets. No fresh incident claims implied.
- Source code promotion PR [#28](https://github.com/ArrakturIL/regional-osint-feeds/pull/28), branch `fix/collector-storage-cutover-20261115`. Implements reviewed `config/collector-rollout.json` allowlist and helper `scripts/collector_rollout_flags.py`, preserving existing optional repo variable overrides and per-source D1-success/commit-suppression conditions. All eight workflows keep old GitHub fallback **only when their D1 step fails**. Initial allowlist `gdelt` only; broader rollout MUST be based on source acceptance, not guessed. TDD RED in PR run 43745657777 (missing module) and GREEN in 43746145133/43746330102 (Editor and all validation jobs success). Temporary bundled Worker files and one-time QA workflows were removed from PR diff before merge; source bundle blobs remain in isolated branch history.
- Pending gates before declaring zero recurring JSON commits: observe a second scheduled/main 8-source Neon→D1 sync, review and graduate rollout allowlist for remaining sources, ensure PR CI green and release to main, confirm collector Action runs skip commits after D1 readback, and recheck source statuses + Page RU/HE API (current connected Cloudflare web fetch blocks public site host). Never claim completed merely from source code or feature flags.

**Rollback:** Restore old Worker version deployment (IDs above) or clear read flags; revert `config/collector-rollout.json` source list to empty and legacy GitHub pushes resume on subsequent runs. Do not delete Neon/D1 caches, keys, secrets, or historical JSON.


## 2026-11-15 ~18:28 UTC — EIGHT-SOURCE ROLLOUT PATCH READY, NOT YET MERGED

- The current `config/collector-rollout.json` is now `stage=graduated` with all eight allowlisted: analysts, centcom, copernicus, gdelt, marad, news_translation, satellite, unosat. Each workflow first validates the config via `scripts.collector_rollout_flags`, performs a source-specific Neon→D1 write + readback, then suppresses its former JSON `git push` **only when** the D1 step outcome is success. Any D1 failure retains existing GitHub writeback and raises a visible workflow failure.
- Red/green CI: general 8-workflow test deliberately failed before each workflow was wired (run `43745969639`), then app suite `43746145133` and `43746330102` passed. A separate all-eight source-policy test deliberately failed against canary-only config (`43746609470`), then `43746676393` app checks passed after promotion. Green source/translation/integrated CI checks also observed on the branch.
- Monitor live manual reader runs succeeded without rejected collectors: GDELT OK; CENTCOM and MARAD OK; UNOSAT OK; Copernicus PARTIAL with API-coverage caveat; NASA satellite PARTIAL with two recorded gaps. Partial states are expected honest semantics; do not conflate partial with a collector runtime error.
- Editor has new production read flags for both analysts and news_translation, with both D1 SHA-256 snapshots verified against Neon. Need confirm live Editor API and repeated import success if possible; GitHub writeback remains a safe fallback if D1 projection fails.
- Another isolated 8-source shadow verification workflow was created and triggered on the work branch, then removed from the PR diff; verify its actual second run by checking D1 `synced_at_ms` and hashes rather than assuming scheduling. Existing main cron `23 */2 * * *` remains active/configured.
- PR #28 is DRAFT until final complete CI; **the live old collector JSON commits are still enabled on main until PR merge**. After merge, verify actual source workflow jobs and main commit history before claiming the problem fixed. No bulk deletion, secret exposure or force push.


## 2026-11-15 ~20:52 IL — ЗАВЕРШЕНИЕ БЛОКА COLLECTORS / NEON / D1 / GITHUB

**USER WORKFLOW:** завершить один блок TODO, обновить [MASTER TODO](./REGIONAL_WATCH_MASTER_TODO.md), сообщить результат пользователю, **остановиться до команды на следующий блок**. Не начинать QA новостей или UI самостоятельно.

**РЕЛИЗ:**
- [PR #28](https://github.com/ArrakturIL/regional-osint-feeds/pull/28) merged to main `c58340d7ce438f622368befaf7ff4272eac80868`. Все восемь source workflows читают политику `config/collector-rollout.json`, source Neon→D1 writer checks stored digest readback; GitHub JSON writeback выполняется **только при source D1 failure**. Основные редакторские/monitor Workers опубликованы и настроены (IDs см. выше).
- [PR #29](https://github.com/ArrakturIL/regional-osint-feeds/pull/29) merged to main `0b00b1be3d76ee04cdb37fdc725d6247a3f6d839`. Scheduled job в `.github/workflows/collector-shadow-sync.yml` теперь вызывает `scripts/sync_neon_primary_to_d1.py`: проверяет **все восемь Neon JSONB payloads** и хеши заранее, затем зеркалирует в private D1 с monotonic+hash readback. **Ни один устаревший GitHub JSON snapshot не перечитывается**, ни одного git push из reconciler. Старый `scripts/sync_collector_shadows.py` оставлен только для ручного аварийного отката и тестов.
- REAL PRODUCTION SOURCE RUNS: all eight main workflow IDs **SUCCESS**, per-source D1 sync step **SUCCESS**, data JSON commit step **SKIPPED**: analysts `43746934552`, CENTCOM `43746934593`, Copernicus `43746934582`, GDELT `43746934609`, MARAD `43746934548`, satellite `43746934631`, UNOSAT `43746934605`, news translation `43746934572`. No need to fabricate another validation run.
- REAL PRODUCTION RECONCILIATION: [GitHub Actions #43748774226](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43748774226), on main SHA `0b00b1be3`: **SUCCESS**; 54 offline tests OK and actual runner stdout `replica_sync mode=neon_primary sources=8 d1_verified=8`. Both production deploy/worker settings remained active. Independent subsequent Neon SQL + Cloudflare private D1 SQL: **8/8 source data and status SHA256 pairs match**. Older MARAD/NASA collection timestamps reflect their collector schedule and do not invalidate exact replication; distinct `partial` coverage states are not silently converted to `ok`.
- Old PR #27 closed as superseded (not merged); no new Worker token privilege required for this release. No changes to existing Cloudflare secrets, Pages public data contracts, news translations, editor outputs, P1 cached articles or browser UI.
- [Master TODO](./REGIONAL_WATCH_MASTER_TODO.md) updated in main by commit `f2377c468d6da78ab89ebed3a378f9841c0352d0`. GLOBAL-01..08 and D-03..06 closed for the collector block; GLOBAL-09/H and quota/UX/backlog remain for the **next user-approved block**.

**One remaining limitation (NOT a collector-block regression):** the conditional GitHub fallback on a *real* Neon/D1 outage was verified by source workflow contracts and offline tests, not by deliberately breaking production; user-visible RU/HE/browser end-to-end acceptance is the next independent QA block. Do not claim all platform QA is finished.

**RECOVERY:** treat this final section and updated main TODO as authoritative over all earlier entries declaring PR #28/#29 open, outdated Worker versions or legacy JSON publication active. If another chat resumes, read both; **wait for user's next block command**.


## 2026-11-15 ~21:46 IL — DEV-01 COORDINATED RELEASE COMPLETED

User workflow: full architecture/dev block → updated MASTER TODO → brief report → **STOP and wait for next block command**. Site-wide QA/content/UX is done separately; no global QA by this developer.

**Fact-backed final implementation:**
- [PR #30](https://github.com/ArrakturIL/regional-osint-feeds/pull/30): immutable source-locked Pages + Editor + Monitor bundle, SHA-256 manifest (21 files), workflows and Collector rollout flags in manifest, D1 schema preflight (6 tables), Cloudflare API binding/cron/secret name preflight, orderly Worker→Pages deployment, exact-version rollback and release receipt.
- User's existing `CLOUDFLARE_D1_API_TOKEN` already had Cloudflare **Workers → Admin** rights granted earlier on Nov 15. No separate Workers token is required. REAL trusted read-only [Actions #43752596321](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43752596321) passed D1 schema and Worker+Pages binding reads using GitHub repo secrets.
- [PR #31](https://github.com/ArrakturIL/regional-osint-feeds/pull/31): first successful coordinated [run #43752897274](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43752897274) unexpectedly enabled Worker preview URLs via Wrangler default. Immediately changed both live subdomain settings back to `previews_enabled=false`. Pinned `preview_urls:false` in both production Wrangler configs and added live preflight/postcheck + rollback restore. Verified both Worker previews disabled after final production release.
- [PR #32](https://github.com/ArrakturIL/regional-osint-feeds/pull/32): second hardening main [run #43753618421](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43753618421) got Pages URL HTTP 404 immediately after deployment and successfully rolled back both Worker versions + previous Pages deployment. Fixed bounded retry for transient Pages 404/503 and replaced dangerous `latest_deployment` with actual active `canonical_deployment` as rollback target.
- FINAL success: main commit `14ce89599ecca96d645c4461b33970b67e719925`, [GitHub Actions #43754130567](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43754130567) **ALL release/source jobs SUCCESS**, preview optional job SKIPPED. Preflight + D1 schema + Worker deployments + technical `/`, `/he/`, `/api/overview` HTTP 200 + postcheck + release receipt all succeeded. Artifacts: `rw-unified-release-bundle`, `rw-coordinated-release-receipt`, `rw-coordinated-rollback-baseline`.
- Independent connected Cloudflare API verification: active Pages **canonical deployment** `c6ad7331-e21a-4340-9f80-b14051fe9d8a` `success`; Editor Worker deployed `c35e47ba-707e-4ae4-95df-e748b68fa566` 100%, cron `*/5`, AI/CORE_DB/NEWS_DB/`REGIONAL_EDITOR_CACHE_SOURCES`; Monitor Worker `7aedb492-e136-482a-b52f-893a9b07e712` 100%, cron `*/1`, DB, `REGION`, `COLLECTOR_CACHE_SOURCES`, 4 secret bindings. Both Workers `previews_enabled=false`, `workers_dev=true`. No D1 migrations or production data changes made by release.
- [MASTER TODO](./REGIONAL_WATCH_MASTER_TODO.md): DEV-01 and A-03 marked complete, A-02/A-04/H-01 partially open for other broader work. Next recommended DEV-OSS-01…05 (free OSS tool integrations) only after user's instruction. No site-wide QA performed.

**Recovery:** This final checkpoint supersedes all earlier sections suggesting Workers deployment credentials missing, PR #30 not merged, or Pages release still separate. Follow the latest main MASTER TODO, not old historical branch snapshots.
