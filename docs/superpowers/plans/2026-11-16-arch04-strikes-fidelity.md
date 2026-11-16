# ARCH-04 / PR: reject military-strikes → labor-strikes false friends

Date: 2026-11-16. Read-only audit source: Crosswalk Claude review `reviews/REGIONAL_WATCH_TRANSLATION_REVIEW_CLAUDE_2026-11-16.md` and golden corpus C05/C06/C07/C19/C21. Frozen v64 module/source boundary preserved.

## Problem / baseline

The site stores invalid Hebrew translations of English military `strikes` as `שביתות` ("labor strikes"). Existing regexes match only singular `strike\b` and miss plural `strikes`, both in JS and Python; the bad output passes validation and can appear as translated.

## TDD (single isolated behavior)

1. RED: add test cases for military plural C05/C06/C07 to `tests/architecture/translation-semantics.test.mjs`, asserting `factualTranslationIssue` returns a meaning-risk code and `validateCandidate` rejects it. Add Python `valid()` equivalent regression and labor positive controls. Run CI via PR, require expected failures.
2. GREEN: add a conservative shared JS military-strike risk helper to `backend/editor/src/translations/semantic-meaning.mjs`, reuse it in `news-mirror.mjs` and via existing `fact-guard.mjs` semantic hook. Python parity in `scripts/translation_semantics.py` (already called by `valid`). No schema/model/API/cron/budget changes.
3. Verify mandatory Editor source tests (including both Node+Python), app/integrated checks, diff and exact frozen baseline. Publish via coordinated release, verify Cloudflare Worker active version and unchanged bindings.
4. Separately address native-HE wasted attempts, paced quotas, RU attempt telemetry, and Gemini A/B (not in this PR). No new free-tier external providers or key use.

## Risk constraints

- Reject only military context `strike/strikes` rendered into Hebrew labor `שבית*` or Russian `забастовк*`; allow legitimate union/worker/teacher/pilot/hunger/general strikes.
- Preserve original-language source and source attribution. Classifier is conservative; avoid broad unsafe rewrites.
- Ensure exact current-code RED, post-fix GREEN; no test claiming semantic correctness beyond covered failure class.
