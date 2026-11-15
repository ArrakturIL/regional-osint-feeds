# REGIONAL WATCH — Integrated Neon & QA checkpoint, 15 November 2026

## State after ChatGPT transport interruptions
- Integration feature branch: `feature/integrated-data-quality-neon-20261115`.
- Last code head before writing this checkpoint: `57a1c0c7e9df2b6ee71405886fadd19a976105cc`.
- Production `main` at checkpoint: `83bf314edd26dff4a5718f1791439cbf1d389a24`. Do NOT merge or deploy production until the full integration/cutover gate is satisfied.
- Neon organization Free, project `regional-watch-data`, project ID `weathered-resonance-71661530`, database `regional_watch` (AWS eu-central-1, PostgreSQL 18).
- Table `public.regional_collector_snapshots` exists and has **8** seed/backfilled rows: GDELT, analysts, CENTCOM, Copernicus, MARAD, satellite, UNOSAT, news_translation.
- Backfill was done with authorized connected Neon tool; **this is not proof that GitHub Actions writes automatically**. The existing Actions files are still in `main` unchanged and collect/commit JSON; mirror workflow changes are on the feature branch only.
- **Blocking dependency:** GitHub Actions secret `NEON_DATABASE_URL` is not confirmed configured. Current GitHub connector lacks write access to repo secrets. Secret must be added through GitHub repository Actions secrets by the user/authorized GitHub administrator (never paste it into chat, source code or logs). Connection string available privately in Neon dashboard. Do not claim live shadow writes until verified through real Actions run.

## Confirmed work in feature branch
1. Design & implementation plan: `docs/superpowers/specs/2026-11-15-regional-watch-integrated-architecture-design.md` and `docs/superpowers/plans/2026-11-15-regional-watch-neon-quality.md`.
2. Schema `storage/neon/001_collector_snapshots.sql` and validated, timestamp-protected, atomic writer `scripts/neon_mirror.py`.
3. Optional secret-safe publisher `scripts/publish_neon_mirror.py`, ready to be connected in scheduled Actions. Old GitHub JSON fallback still in place.
4. NEW integrity readback (TDD): `scripts/neon_mirror.py` now includes `validate_stored_row` and `read_stored_snapshot`: checks actual JSONB against SHA256 metadata, correct checked_at, status, type and size; `verify_snapshot` checks payload, not only stored digests. CI red tests witnessed before fix; latest green: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43675489929.
5. Eight collectors' GitHub workflows updated in feature branch to allow optional shadow Neon writes; not yet active in `main`.
6. Translator factual-risk guards for naval mines vs mining facilities, actor inversion, modality/condition in `backend/editor/src/translations/`, `backend/editor/src/localization/`, and Python translation mirror. Preserve original text, quarantine incorrect cached RU/HE `needs_review` candidates.
7. Editorial events grouping: `backend/editor/src/news/` claim-identity and explicit source attribution; separate strikes and named targets; preserve contradictory casualty claims. API Latest mode is chronological, explicit `sort=priority`; RU/HE sequence checked by regressions.
8. Frontend QA: compact Digest, source-order CSS columns for news feed, Russian pluralization, Hebrew back-to-top accessibility, archive requesting chronological sort and no unused duplicate page polling.
9. Current test suite includes `tests/architecture/news-quality.test.mjs`, `tests/architecture/news-localization-provenance.test.mjs`, `frontend/tests/ui-qa.test.mjs`, `scripts/test_neon_mirror.py`, `scripts/test_publish_neon_mirror.py`. Latest verified CI suite on current code: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43675489929; full Pages CI earlier https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43674322672.

## Next steps (do not redo completed work)
1. Implement safe **authenticated server-side Neon read path** with caching/backoff and existing GitHub fallback. Read from Neon only when explicitly enabled, never expose a DB connection URL in browser or public endpoint. Neon Data API requires JWT/RLS; don't create a public unauthenticated endpoint and exhaust Free quota.
2. Add end-to-end read parity and source freshness reports against GitHub source JSON with last-good fallback. Use the validated `read_stored_snapshot` contract. Test missing secret, corrupt payload, missing source, stale snapshot, tie/conflict, timeouts and Free capacity.
3. Arrange secure GitHub Actions `NEON_DATABASE_URL` secret through authorized UI; confirm via sanitized Actions result. Shadow write, observe several real collection cycles, verify all eight sources.
4. Only after private reader and real shadow checks succeed, cut over one collector at a time and disable **its** JSON git commits, keeping rollback. Do not disable all eight in one change.
5. Run source-to-event E2E tests with real D1 fixtures, RU/HE UI smoke in integrated preview, and full QA. Editor/Monitor Workers are not redeployed just because Pages preview is green.
6. Review requested lightweight OSS/framework additions only on measured evidence (no heavyweight new stacks). Evaluate data quality, source independent confirmations and translations against QA fixtures.
7. Final commit/merge/publish production only after demonstrable cutover and validation.

## Distinctions
- Current production remains `https://regional-watch.pages.dev/`, **old working read/write path**.
- The integrated Pages preview was `https://8ebab741.regional-watch.pages.dev/` during previous verified UI steps; subsequent changes are Neon Python/tests only, not a new Pages deploy.
- No claim that Neon has replaced GitHub storage until commits actually stop in `main` and the server-side reader is proven functional.
- GitHub Actions and Cloudflare D1/Worker live bindings are shared by sensitive production paths; avoid mutating D1 in preview.
