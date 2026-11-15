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

## 2026-11-15 — TRANSPORT INTERRUPTION: VERIFIED SAFE HANDOFF
- User reports another chat/connection error. **Stop new implementations and leave work at a durable checkpoint.**
- Connected GitHub PR #25 remains OPEN and DRAFT, head at time of verification `2a0a9ec8c8bda9fe518e4385e4746b6ec6ab691a` (commit subject: `ci(release): isolate architecture preview and smoke real RU/HE APIs before main`). Main and integrated feature base **not merged**; no forced ref update.
- Latest app checks [run 43741760905](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43741760905): 10/10 validation jobs SUCCESS; both Pages preview and production deploy jobs SKIPPED. Latest integrated-data checks [run 43741760890](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43741760890) SUCCESS. Live production smoke [run 43741760986](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43741760986) SUCCESS, but this is the existing production system, **not proof integrated new code was deployed**.
- Work on global architecture already committed on this isolated branch: `scripts/sync_collector_shadows.py` validates all 8 collector snapshots, writes Neon in one transaction and D1 shadow with readback; `.github/workflows/collector-shadow-sync.yml` schedules 2h on **main only** and hence is NOT currently running; `scripts/test_collector_shadow_pipeline.py` runs in CI; Pages preview workflow extended with an isolated branch path and RU/HE API smoke gate. The CI code compiles/tests; scheduled live cycles and full preview integration **not yet verified**.
- User's latest priority order explicitly is **GLOBAL INTEGRATION FIRST**: repo/branch reconciliation, deploy Cloudflare Pages + Editor + Monitor and bind D1 safely, enable recurring Neon→D1 shadow, verify multiple real cycles / backup fallback, then individually retire JSON commits; content and translation polish LATER.
- Existing production D1 has the private immutable 3-row translation backup batch `rw_p1_20261115_userapproved_1909` but the user redirected priorities **before any article correction**. Do not start any P1 record updates during architecture migration.
- Safe recovery: first fetch current PR #25 HEAD, newest GitHub workflow status and this final checkpoint; compare source/target branch before merging. Do not replay commits or assume a release. No background task or unattended continuation has been initiated.
