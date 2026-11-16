# ARCH-04 — HE candidate recency and controlled same-day retries (BACKEND only)

Baseline main `293501a4b1c0aab1d9046e8ad883cecb39058c93`. Original current scheduler Git blob SHA `fedc58a681f0e16007dc8311a91c5342dbf2581a`. Previous PR #70: daily cap 112, accurate usage, partial/budget states; preserve all.

## Production evidence (read-only D1)
- NEWS D1 16 Nov 2026: 91/112 HE attempts so far, news 21 OK / 17+ errors; 15 missing high-priority HE rows older than 2026-11-09, all 15 already attempted and failed today, **zero missing-news rows unattempted today**. Most fail `low_translation_confidence`, `numbers_changed_*`, semantic person/actor guards; transient `8004: Internal server error`, `model_incomplete`. D1 15 missing-first rows have high older priority and repeated errors; new content can be postponed by current order `(cached missing), priority DESC, published DESC`.
- Repeated same-day attempts before this change may spend 112 budget on the same semantically unsafe input. Do not relax fact checks; do not imply every existing pending row can be fixed by scheduling.

## Narrow change
1. New pure `backend/editor/src/localization/retry-policy.mjs` exports `eligibleHebrewRetry(previous, now)`: one same-day retry maximum only for `8004: Internal server error`, `model_incomplete` or `model_invalid_response`, after >=30 minutes since last attempt; forbid retry for invalid numbers, actor identity, unsupported confidence, missing/unknown timestamps, already-running/ok/budget, and error retry_count >=1. Cross-day attempts remain allowed by existing (kind,item_id,hash,UTC-day) idempotency key. New source hash always gets a new attempt even same day.
2. Scheduler existing prior-attempt SELECT extends columns `error,attempted_at_ms`. Use pure helper for the retry decision without relaxing atomic SQL conditional retry, 112/day and 4000 neurons; new missing HE news sorted **newest first** and priority as tie-breaker (cache miss still ahead of existing entries).
3. Strict parity: new `tests/architecture/localization-retry-source-parity.mjs` rebuilds exact prior scheduler blob `fedc58a681f0e16007dc8311a91c5342dbf2581a`; modify earlier `localization-budget-source-parity.mjs` to use this reconstruction so old `fb23350a8eb586b60cd30873ffac6c46eb161d99` and v64 pins remain.
4. Test RED→GREEN in `tests/architecture/editor-localization-retry-policy.test.mjs`, plus full app and integrated CI, immutable three-way build, one focused PR, squash and coordinated production deployment with Cloudflare read-only postcheck. No D1 write outside existing runtime paths; no historical B-01 fixes.

## What this does NOT do
Does not increase HE cap or cron, solve all pending news, modify RU batches (20/day separate next item), change model, translation quality checks or frontend. Does not assert postrelease improvement until measured from D1 over time. Keep ARCH-04 provider manual/parallel/cooldown wider audit open.


## Completion receipt — 16 November 2026

- [x] D1 read-only diagnosis: 15 high-priority news without HE row all failed earlier same day; zero never-attempted high-priority missing rows. RU 20/20 batches but high-priority new items all RU-complete; pending RU mostly priority 4–6.
- [x] New pure `eligibleHebrewRetry` controls one transient second attempt with 30-minute cooldown; rejects deterministic QA/fact/numeral/actor same-day retry. NEWS missing HE candidates newest-first, unchanged QA/prompt/112/day/4000/4-cycle/5m Cron.
- [x] [Expected RED #43800944926](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43800944926), [GREEN app #43801136813](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43801136813) and [integrated #43801136812](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43801136812), immutable triple artifact. Strict Git source reconstruction pins current prior `fedc58a681f0e16007dc8311a91c5342dbf2581a` and earlier two scheduler sources.
- [x] [PR #71](https://github.com/ArrakturIL/regional-osint-feeds/pull/71), squash source `3d5892a3251c51337e3f5fb7495b125350b171b1`; [coordinated production #43801273718](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43801273718) SUCCESS. Independent Cloudflare read-only binding, version and cron postcheck recorded in MASTER TODO §21.
- [ ] Later: verify real HE approved count and pending age after a UTC day, not merely passed CI. RU policy on priority 4–6 and source relevance, provider health/rate limits and manual concurrency remain ARCH-04 open. No frontend or archived B-01 edits.
