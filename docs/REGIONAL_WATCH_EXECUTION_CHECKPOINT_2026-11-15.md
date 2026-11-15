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
