# ARCH-03 — итоговая приёмка модульного Editor

**Дата:** 17 ноября 2026. **Вердикт: ARCH-03 технически закрыт в области архитектурного разделения Editor и его межкомпонентных контрактов.** Это не означает завершение RU/HE контентного QA или закрытие всех backend-продуктовых дефектов.

## Проверяемый код и CI

- **Исходный код:** `main` уже содержит модульный Editor, исторические стадии декомпозиции находятся в [журнале DEV-05](DEV_05_BACKEND_ARCHITECTURE_AUDIT_2026-11-16.md). Финальный перенос очереди аналитиков выполнен в [PR #69](https://github.com/ArrakturIL/regional-osint-feeds/pull/69), предыдущие этапы через PR #51–#68. Логика прежней системы сохраняется проверками source-parity и tests.
- **Новый формальный acceptance gate:** `tests/architecture/editor-cross-component-acceptance.test.mjs` — **5/5 SUCCESS** в [PR #84](https://github.com/ArrakturIL/regional-osint-feeds/pull/84), branch HEAD `a0841122d91ebcfdc110ec51d320136b5ea259eb`.
- **Свежий [full app CI #44006363408](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/44006363408): `completed/success`**. Все 11 выполнявшихся программных jobs завершились успешно (Editor / Monitor / Pages / frontend, и immutable Pages+Editor+Monitor build); Preview и coordinated production публикации пропущены на PR. В `editor-source` основной регрессионный Node-прогон — **116 passing, 0 failing**; отдельно cross-component acceptance **5 passing, 0 failing**, затем сохранённые семантические и Python-интеграционные тесты CI.
- **Никаких изменений runtime `backend/editor/src/**`, Cloudflare Worker, cron, D1, AI, provider, schema, publish или пользовательских данных.** PR #84 по-прежнему не объединён в `main`: постоянный новый acceptance gate начнёт действовать в `main` только после отдельного разрешённого release / merge. Текущий production code не менялся.

## Матрица ответственности — проверено на реальном модульном источнике

| Область | Канонический владелец | Доказательство |
| --- | --- | --- |
| Все действующие модули Editor | `backend/editor/src/index.js` → импортный граф | ARCH-01: **34/34 достижимы**, нет unresolved/cross-worker imports |
| Pages → Editor | `backend/pages/src/index.js` → `EDITOR.fetch` → настоящий `editor.fetch` | Новый runtime-acceptance: RU/HE `/api/languages`, ошибка языка без D1 read, real `/api/analyst-posts/:id` routing |
| Разделение приватного и публичного | `backend/pages/src/routes.js` | `/api/translation-queue`, `/summary`, неизвестные /api routes не публикуются через Pages |
| News ingestion/normalization/grouping/scan | `news/rss.mjs`, `news/ingestion.mjs`, `news/events.mjs`, `news/scan.mjs` | `editor-rss-boundary`, `editor-news-ingestion`, `editor-scan-orchestration`, direct module boundary checks |
| Editor AI и RU/HE | `translations/scheduled.mjs`, `editorial/ai-comments.mjs`, `localization/{scheduled,news-reader,editorial-reader,stories-reader,analyst-api}.mjs` | 116 source suites включают quota/atomicity, source parity, status/provenance, CORS and fail-safety |
| Analyst pipeline | `analysts/{source-ingestion,editorial-decision,queue-runner,public-api,translation}.mjs` через `analysts/editor.mjs` | Прямые stage tests для D1 idempotency, 3 AI/run, published provenance, metadata-only paths |
| Расписание и два D1 | `Editor scheduled` и canonical release contract | 5-min cron, CORE_DB/NEWS_DB/AI, mirror at :00/:15 etc, enrich at :05, analyst at :30, independent queue ID/AI budget |
| Неискажённый source после split | Frozen v64 source и исторические pre-split Git object checks | `editor-modules`, `localization-*`, `analyst-*` проверяют source-parity и защищают сохранённые контракты |

**Техническая граница:** часть нового acceptance проверяет реальные вызовы `handlePages → editor.fetch` на фальшивой service binding без D1-соединения, остальные source-границы и schedule wiring проверяются статическими assertions и отдельными unit/integration tests. Это **не** полноценный live browser QA и **не** доказательство работоспособности всех живых провайдеров / бюджетов на каждом цикле.

## Что не блокирует закрытие ARCH-03

- **ARCH-04/05**: независимые приёмки уже назначены на 20.11 и 18.11.2026 соответственно; до них **DEFERRED / PLANNED ACCEPTANCE**, без новых текущих задач.
- **B/C/E продуктовые дефекты**: переводы и их source-hash, ложные RU слова в заголовках аналитиков (E-06), сортировка/атрибуция новостей, ошибки внешних источников. Соответствующие пункты не становятся CLOSED от того, что архитектурный Editor собран корректно.
- **Frontend и глобальный QA**: отложены до полноценной backend acceptance. Технический build/CI не является визуальным и live-контентным QA.
- **ARCH-07**: отдельный следующий пункт — заключительная системная приёмка и release/rollback evidence. Его нельзя помечать завершённым вместе с ARCH-03. Production deploy/merge делается только в согласованном релизе, не ради тестового отчёта.

## Решение

На действующем коде не найдено незаконченного структурного переноса Editor. Старое значение `ARCH-03 [~]` описывало недостаток сквозного acceptance после PR #69; недостающий Pages→Editor и межмодульный gate теперь подтверждён отдельным **5/5** и full app **SUCCESS**. Следовательно **ARCH-03 [x]** в каноническом TODO, без перемен бизнес-логики и без Cloudflare release.
