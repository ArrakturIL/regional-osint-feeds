# ARCH-04: skip native Hebrew source news in HE AI scheduler

Date: 2026-11-16. Read-only Claude Crosswalk review RC9 + live D1 evidence from REGIONAL WATCH. Scope one behavior, no translation model, budget, cron, API, or schema edits.

- Bug: `localeCandidates(env,'news')` selects priority>=7 news with a Hebrew original headline. `sourceText('news',row)` may prefer `headline_ru` over the native Hebrew original. HE inference is then redundantly run for a source already returned as `source` by `localizeNewsRow`, wasting finite HE 112/day budget.
- RED: existing Editor scheduler tests demonstrate native-Hebrew records currently consume attempts, including when Russian translation is present. Positive English rows must still translate.
- GREEN: skip the source row in `localeCandidates` before constructing the candidate list, checking original `headline` for Hebrew characters; do not infer original language from `headline_ru`. Restrict change to HE scheduler candidate filtering. Leave SQL, sourceText fingerprint contract, and published output untouched.
- Verify: mandatory Editor/source tests, integrated tests, original v64 parity, zero new English regressions. Coordinated release and Cloudflare postcheck.
- Follow-ups excluded: pacing/quota distribution, RU retry ledger, event representative expansion and Gemini provider.
