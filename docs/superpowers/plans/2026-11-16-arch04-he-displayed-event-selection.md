# ARCH-04: HE scheduler selects visible event representatives (P0)

Snapshot 16 November 2026, after PR #74. Read-only live Cloudflare: among latest 96 event groups, 32 non-native HE representatives had no valid cache, 27 of them had event priority 4–6. Public `/api/news?lang=he&limit=40` had 15/40 pending. Current HE scheduler instead selects source `n.priority>=7` only. Existing RU PR #72 already uses visible representative selection.

## Scoped plan (RED → GREEN)
1. Add scheduler-level test with event groups priority 4/5/6, a nonrepresentative priority4 and high-priority news priority8. RED demonstrates old selector does not translate visible low-priority representatives.
2. Update `backend/editor/src/localization/scheduled.mjs` news candidate SQL to choose high-priority fresh news over past 7 days **or** an event representative with `g.priority>=4` and last_seen in past 36 hours. Preserve missing-translation checks, ordered first uncached/newest, LIMIT 120, 4 per scheduled cycle, existing model and daily 112/4000 budget. Keep native HE bypass from PR #74.
3. Extend exact source-parity reconstruction of scheduler (undo only the reviewed SQL/binding changes). Mandatory app/integrated/OS mirror tests GREEN, PR review, coordinated production release, Cloudflare independent postcheck.
4. No translation model, Gemini, cron, budget, concurrency, source hash, public API, or D1 schema changes. Continue pacing and failed-retry observability in separate PRs.

**Risk:** Low-priority event representatives share the same finite HE pool as important news/analyst/story. The query's newest-first selection may delay priority>=7 under load; measure after release and introduce urgency lanes/pacing in follow-up, not a silent cap increase. Existing validated HE translations preserved.
