# ARCH-06 — полный учёт исторических Worker-тестов и решения KEEP / ARCHIVE (17.11.2026)

**Статус:** предметный coverage review сделан по всем **14** реальным `worker/test-*.mjs` и активным `backend/**` + `tests/architecture/**` suites. Ветка [PR #84](https://github.com/ArrakturIL/regional-osint-feeds/pull/84), read-only audit. **Существующие historical tests не удалять:** они всё ещё запускаются через `.github/workflows/worker-check.yml` при изменении `worker/**` и содержат уникальные фикстуры, которых нет в modern CI. Это сохранение доказательств и rollback context, а не утверждение production usage.

## Матрица тестов — ни один исторический root не остался без решения

| Старый CI root | Уже перенесено или покрывается современными production-path тестами | Особые старые проверки / решение |
| --- | --- | --- |
| `test-adsb-recovery.mjs` | `backend/monitor/tests/provider-recovery-runtime.test.mjs`: cooldown/no-write, Tehran-first, broad military suppression, healthy cadence | **KEEP** до исторического snapshot rollback; direct modern 9 scenarios прошли |
| `test-analysts-translation.mjs` | `tests/architecture/legacy-editor-runtime-parity.test.mjs` + `editor-localization-analysts`: source-chunk max6, 1350 char, numeric formats, Hebrew negation, confidence/length guard | **KEEP**: original expected source module still referenced from old CI |
| `test-analysts.mjs` | `editor-analyst-source-ingestion`, `editor-analyst-decision`, `editor-analyst-queue-runner` | **KEEP**: source URL validity/age, exact-quote non-fabrication, AI daily reservation edge cases/field-name regressions |
| `test-aviation.mjs` | `backend/monitor/tests/summary-runtime.test.mjs`, `provider-client-runtime`, `provider-recovery-runtime` | **KEEP**: old private API contracts and historical summary/provider samples retained |
| `test-editorial-comment-policy.mjs` | `editor-ai-comments` + direct `backend/editor/src/editorial/comment-policy.mjs` | **KEEP**: old suppression topics and publication policy fixtures remain active |
| `test-gdelt.mjs` | `scripts/test_gdelt_cursor.py`, `collector-cache` tests, `backend/monitor/src/collectors/media/gdelt.js` | **KEEP**: old source-specific malformed country filter, machine-coded caveat, zero-vs-error snapshot mocks |
| `test-geo-catalog.mjs` | `backend/monitor/tests/geo-catalog-runtime.test.mjs`: 6 real production-path catalog fixtures | **KEEP**: old scheduled path+source_status / D1 response states not wholly identical |
| `test-live-editor-integrity.mjs` | `legacy-editor-runtime-parity` (BE-01/02/03/12) + `translation-semantics`, `news-localization-provenance` | **KEEP**: source URL/event date vs announcement, invalid cached Hebrew disclosure, story ownership cases still have historical fixtures |
| `test-live-news-events.mjs` | `news-quality`, `editor-news-ingestion`, `editor-he-event-representative-selection` + `editor-ru-event-representative-selection` | **KEEP**: old exact 12 publisher feeds, EN/HE/AR grouping, splitting one event into two, page-size stable ordering |
| `test-live-news-normalization.mjs` | `legacy-editor-runtime-parity` direct modern URL and Unicode/news title tests | **KEEP**: historic corpus and old standalone Worker check |
| `test-news-analysts-integration.mjs` | `editor-analyst-public-api`, `editor-news-ingestion` | **KEEP**: old combined Editor routes/news+analysts snapshot, public endpoint fallback status fixtures |
| `test-open-source-translation.mjs` | `translation-semantics`, `legacy-editor-runtime-parity` fact-guards, `editor-scheduled-translations` | **KEEP**: raw candidate queue and exact ballistic-vs-tactical, anti-Jewish posts, role/name mistranslation safeguards |
| `test-provider-adapters.mjs` | Production uses `adsb.lol` and `avioadsb.org`, NOT old optional OpenSky/ADS-B Exchange adapter; current Monitor collector and network tests cover present providers | **KEEP / NONPRODUCTION HISTORICAL**: OpenSky authorization/no-aircraft stale sample, ADS-B Exchange entitlement still historical but not production import |
| `test-provider-collectors.mjs` | Present Monitor `provider-client-runtime` verifies its actual HTTP 429/403, stale/lease/quota responses | **KEEP / NONPRODUCTION HISTORICAL**: optional OpenSky/ADS-B Exchange one-call, credential guard; no demand to activate old optional providers |

**Уровни доказательств не путать:** «тот же класс проверки в modern suite» ≠ byte-for-byte assertion parity. В этой матрице для old-only конкретных cases выставлено **KEEP**, а не `SAFE DELETE`. Значит существующая безопасность не ухудшается, даже когда modern покрытие пока только частичное.

## Четыре исторических Editor-модуля — НЕ бесхозные

Консервативный import graph сперва показывал четыре файла не достижимыми **из старых тестовых entrypoints**, однако `.github/workflows/worker-check.yml` напрямую выполняет `node --check` для каждого:

- `worker/live-editor/regional-watch-editor.js` → imports `analysts-editor.mjs`, `story-enrichment.mjs`
- `worker/live-editor/analysts-editor.mjs` → `analysts-translation.mjs`
- `worker/live-editor/analysts-translation.mjs`
- `worker/live-editor/story-enrichment.mjs`

Их связь гарантирует новая регрессия `legacy-dependency-audit.test.mjs`; проверка прямой CI syntax reachability введена дополнительно. Это **все 4 KEEP**, даже если export прямо из старых tests не вызывается. Ни один `worker/**` файл не входит в immutable modern release; для восстановления старого релиза также есть frozen Editor v64, Monitor v47 и существующий legacy workflow. Из факта отсутствия active prod import не следует разрешение удалять источники.

## Правило окончательной технической приёмки ARCH-06

- Все 14 historical test roots имеют документированное текущее modern соответствие (или констатацию, что соответствующий optional provider не активен) и явное решение **KEEP**.
- Все 31 legacy `worker/**/*.js|mjs` учитываются в графе `tests / CI syntax checks / residual historical subtree`; нет автоматических удалений/архивного перемещения.
- 7 JS + 2 CSS из `frontend/src/legacy` находятся в production manifest, сохраняются.
- Frozen Editor/Monitor baselines имеют потребителей в тестах и сохраняются.
- Надстройка современной защиты — активные CI suites, включая граф ARCH-01, проверки фактического Monitor и Editor modules. Изменений production-сборщиков нет.
- Историческая «тотальная чистка» **не является условием закрытия инвентаризации**: доказанного безопасного кандидата нет. Если впоследствии захочется реально удалять — отдельный пересмотр по файлам + failure/rollback/syntax reachability + объединённый релиз.

**Результат аудита:** для всех известных исторических файлов вынесено консервативное KEEP; не выдавать этот итог за факт полного переноса каждой исторической проверки в production-path тесты и не удалять уцелевшие исторические regression fixtures.
