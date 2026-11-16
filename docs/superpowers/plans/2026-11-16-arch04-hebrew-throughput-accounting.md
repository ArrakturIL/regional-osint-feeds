# ARCH-04 / Backend only — bounded Hebrew translation throughput + truthful quota accounting

Baseline code commit `5bd51c94211428aa2a1cadca4ea652f5b8a339e0`; original `backend/editor/src/localization/scheduled.mjs` SHA `fb23350a8eb586b60cd30873ffac6c46eb161d99`. No frontend or old B-01 repairs.

## Verified root cause, live D1 read-only, 2026-11-16 ~03:32 UTC

- NEWS D1 (`regional-watch-news`): `regional_i18n_budget` = **90/96 attempts**, **265.678 reported neurons** before today's 03:32 run. Previous dates 15,14,13 Nov all **96/96**. `news_translation_budget` RU already **20/20 batches**. Official translation budget 1/12 at that time. HE 16 Nov: news 21 successful/17 errors, editorial 2 success/1 error, plus CORE analyst 1 successful/6 error, story 0 successful/6 errors.
- Retries: for 16 Nov approx 36 of 54 candidate attempt records on second attempt `retry_count=1` (numbers change with time). Quality failures `low_translation_confidence`, `numbers_changed_title/body`, source actor mismatch, `model_incomplete`, and intermittent provider 8004. The existing 96/day limit is binding; refreshing cron does not fix backlog.
- **Accounting bug:** `translateLocaleItem` only sets `neurons` after D1 write of an approved translation. Successful model responses with rejected low-confidence, changed numbers, or incomplete output are **not billed to local neuron tracker**. Thus 266/4000 is not total AI consumption; avoid treating tracker as account-wide free-tier usage.
- Cloudflare official pricing as of Nov 12, 2026: shared **10,000 free neurons/day** for all Workers AI; current used model `@cf/zai-org/glm-4.7-flash` eligible on free plan. Local independent limits remain RU batches 20/day, official translation budget and 4 Hebrew items per 5-minute cycle. No paid services.

## Bounded changes (one PR only)

1. Introduce `HE_DAILY_ATTEMPT_CAP=112` (up from 96, **+16.7%**) while leaving existing `estimated_neurons<4000` hard cap and per-cycle 4 gate. This is a *moderate* local change, not a claim of 10k account-wide headroom. Keep original source priority and retry gates unchanged; optimize retries separately only after data.
2. Accrue `answer.usage.neurons` immediately after `env.AI.run` returns — before finish_reason, JSON parse and quality check — and post daily usage even if translation is rejected. No QA check relaxed. Provider throws without usage must remain unknown, not invented.
3. Persist `last_he_localization` budget state when run hits daily cap before scanning; set `partial` when some conversions failed QA or provider and `budget` when stopped within cycle. Keep existing field names and error handling; report actual counters, do not mislabel rejection as success.
4. Mandatory TDD regression tests in `tests/architecture/editor-localization-budget-backlog.test.mjs`; modify only old assertions that encoded incorrect behavior. Keep old v64 exact Git blob test by reconstructor `tests/architecture/localization-budget-source-parity.mjs` that restores the **specific reviewed changes** from new scheduler and checks original SHA. No silent deletion of source-parity protections.
5. RED CI expected, GREEN full Editor mandatory suite + immutable 3-bundle, PR diff review, coordinated production release, independent read-only Cloudflare verification and read-only D1 postcheck. Document actual effects without asserting daily completed queue improvement before measured.

## Out of scope

- No changes to public UI, sources, model, prompt, translation safety gates, existing historical rows, schema, APIs, 5m cron, RU budget, HE per-cycle cap, or daily 4000-neuron app guard. RU separate follow-up ARCH-04 block; provider cooldown and monitor check also remain open. No paid upgrades.


## Completion receipt — 16.11.2026

- [x] Read-only NEWS/CORE D1 inspection and official Workers AI 10,000 free-neuron/day documentation confirmed. HE 90/96 early 16 Nov; historic 96/96; RU 20/20.
- [x] TDD RED [#43799371448](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43799371448), GREEN Editor app [#43799712304](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43799712304), integrated [#43799712295](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43799712295) success. A preexisting obsolete integrated test locator for extracted analyst queue updated, no UI/production behavior involved.
- [x] [PR #70](https://github.com/ArrakturIL/regional-osint-feeds/pull/70), code `da45af7f68d461c8fc49d3d8ed1397904d87a2b5`, 96→112 HE daily cap, 4000/app untouched, count returned AI usage before QA/rejection, status `partial` and `budget` recorded, exact original source blobs pinned.
- [x] [Coordinated #43799838354](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43799838354) completed SUCCESS, Cloudflare independent read-only confirmation, original secret/D1/AI bindings and cron intact.
- [ ] Later, after a complete UTC day: compare translation successes/pending age/usage and errors; current immediate postrelease read-only D1 still had 90 attempts, no causal improvement claimed.
- [ ] Separate future ARCH-04: RU quota bottleneck, retry/cooldown fairness, actual shared AI budget, monitor provider/manual concurrency.
