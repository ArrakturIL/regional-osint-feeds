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
