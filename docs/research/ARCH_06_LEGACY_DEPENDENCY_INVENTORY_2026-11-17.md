# REGIONAL WATCH — ARCH-06: инвентаризация legacy, связей и безопасной архивации (17.11.2026)

**Статус:** первый read-only аудит завершён; чистка исходников и переподключение тестов **не проводились**, этап ARCH-06 **ещё открыт**. Подтверждение по GitHub `main` (на начало осмотра `3c7bad9c9d46a40a7d2e2b9f9cfe6bb574b54b4d`, 462 tracked blobs без `truncated`). Канонический статус этапов находится в `docs/REGIONAL_WATCH_MASTER_TODO.md`.

## Истинная цепочка production

1. `scripts/release/build.mjs` вызывает frontend сборщик, esbuild собирает `backend/pages/src/index.js`, `backend/editor/src/index.js`, `backend/monitor/src/index.js`.
2. В финальный релиз копируются `frontend/dist/**`, `backend/editor/dist/worker.modern.mjs`, `backend/monitor/dist/worker.modern.mjs`, настройки по `deploy/release-contract.json` и SHA-256 manifest.
3. `.github/workflows/regional-watch-app-check.yml` строит immutable release для Pages + двух Worker и в `main` выкладывает только проверенный bundle; Cloudflare keeps settings/bindings/cron в postcheck.
4. **Нет прямой ссылки на файлы `worker/regional-osint-monitor.js`, `worker/regional-watch-editor.js` или `worker/live-editor/**` в `scripts/release/build.mjs`.** Исторические файлы не являются текущим production entrypoint. Это **не** означает, что их безопасно удалить: ниже есть прямые тестовые зависимости.

## Классификация, доказательства, решение

| Группа | Реально обнаруженная связь | Решение сейчас | Следующий безопасный критерий |
| --- | --- | --- | --- |
| `backend/*/src/**`, `scripts/release/**`, `deploy/release-contract.json` | Три явных production entrypoints; immutable SHA manifest | **ACTIVE / KEEP** | Любая правка только с полным CI и D1/Cloudflare контрактным тестом |
| `frontend/src/legacy/*.js` | **7 файлов** перечислены прямо в `frontend/build-order.json`; `frontend/scripts/build.mjs` конкатенирует весь order в `assets/app.js`, в том числе компоненты `Overview`, `DataRoom`, `Events` и др. | **ACTIVE несмотря на название legacy / KEEP** | Только после изменения текущего runtime, проверки поведения всех RU/HE маршрутов и удаления их из manifest |
| `frontend/src/styles/legacy-theme.css` и `locale-legacy.css` | Обе записи есть в `frontend/styles-order.json`, который `frontend/scripts/build-styles.mjs` собирает в реально выдаваемый CSS | **ACTIVE / KEEP** | Визуальные тесты RU/HE и CSS cascade comparison до/после замены |
| `worker/regional-osint-monitor.js` | Не production. `.github/workflows/worker-check.yml` синтаксически проверяет его, `worker/test-aviation.mjs` импортирует именно его через data URI, аналогичные `worker/test-*.mjs` покрывают исторические контракты | **LEGACY TEST FIXTURE / KEEP** | Перевести необходимые assertions в modern Monitor source tests, доказать parity, затем отдельно обсуждать архив |
| `worker/regional-watch-editor.js`, `worker/analysts-editor.mjs`, `worker/analysts-translation.mjs` | `worker/test-news-analysts-integration.mjs` непосредственно импортирует старый editor; `.github/workflows/worker-check.yml` запускает tests старой реализации | **LEGACY TEST FIXTURE / KEEP** | Сначала эквивалентные modern Editor tests и независимые RO route checks, потом смещение / удаление legacy тестов |
| `worker/live-editor/**` | `worker/test-live-editor-integrity.mjs` импортирует `worker/live-editor/localization.mjs`, `translation-fact-guard.mjs`; другие `worker/test-live-*.mjs` проверяют древние imports; `.github/workflows/worker-check.yml` и `news-open-source-translation.yml` упоминают этот путь | **LEGACY + CI/PATH TRIGGER / KEEP** | Перенастроить CI triggers и перенести достаточное число поведенческих тестов на modern modules, без потери fact guards |
| `baselines/cloudflare/2026-11-14/{editor-v64,monitor-v47}/**` | Frozen v64/v47 baseline: `tests/architecture/editor-modules.test.mjs` сверяет исходные блоки Editor, `backend/monitor/tests/source-parity.test.mjs` проверяет snapshot Monitor | **FROZEN REGRESSION BASELINE / KEEP** | Только после замены byte-level lossless tests на согласованные функциональные fixtures, а не «убрать большие копии» |
| `backend/monitor/scripts/build.mjs`, `backend/monitor/build-order.json` | Legacy compatible assembler нужен `backend/monitor/tests/source-parity.test.mjs`; сам prod уже esbuild ESM напрямую | **TEST TOOL / KEEP** | Переписать parity tests на modern bundler, прежде чем затрагивать |
| `.github/workflows/worker-check.yml` | Отдельный CI, запускающий синтаксис и regression именно для `worker/**`; **не является** доказательством прохождения modern production release | **TEST/LEGACY COVERAGE / KEEP пока есть old tests** | Чётко отделить архивные CI от release CI; не удалять без migration of assertions |
| `worker/DEPLOY.md` | Текст утверждает, что канонический editor source — `worker/regional-watch-editor.js`, предписывает ручные uploads и что GitHub *не* выполняет release; это противоречит актуальным `scripts/release/build.mjs` и `regional-watch-app-check.yml` | **ОПАСНАЯ УСТАРЕВШАЯ ДОКУМЕНТАЦИЯ** | Отметить документ историческим, указать текущий release и правило rollback (без ручного деплоя старого Worker) |

## Что реально дублируется, но НЕ подлежит автоматическому удалению

- Старые и новые реализации Worker пересекаются функционально, **но старые файлы всё ещё участвуют в отдельных тестах**; удаление без переписывания тестов превращает зелёный CI в красный или лишает проверки исторического поведения.
- `frontend/src/legacy` **не дубликат мёртвого кода**, а живая часть frontend manifest. Само название `legacy` здесь вводит в заблуждение.
- Frozen baseline v64/v47 не исполняется production, но используется для доказательства эквивалентности рефакторинга; это архив со значимой проверкой регрессий.
- `worker/DEPLOY.md` относится к старому ручному способу и не должен использоваться как runbook текущего production.

## Порядок ARCH-06

- [x] Проследить source → immutable bundle → Cloudflare deployment для трёх entrypoints.
- [x] Проверить manifests фронтенда и обоих CSS-файлов legacy.
- [x] Найти прямые тестовые ссылки на worker legacy и frozen baselines; выявить ложное утверждение в `worker/DEPLOY.md`.
- [ ] Собрать полный dependency/reference graph для **каждого** `worker/**`, `frontend/src/legacy/**`, каждого workflow и dynamic entrypoint (не просто grep названия).
- [ ] Разделить modern mandatory tests, legacy reference tests, fallback/recovery scripts; выяснить, какие исторические контракты всё ещё уникальны.
- [ ] Для кандидатов на удаление сначала создать современный behavioral test, воспроизвести RED без старой зависимости, получить GREEN на полной CI, сравнить production bundle и route/translation parity.
- [ ] Только после этого перенос/архивирование, с отдельным PR, review, release + rollback; **не удалять автоматически** базовые frozen snapshots, которые держат safety contract.
- [ ] Приёмка ARCH-06 после повторной проверки манифеста и реальной production 3-компонентной сборки; только потом ARCH-07.

**Не менять:** D1/Neon контент, crons, secrets, Workers, лимиты/сервисную топологию, scheduled tasks ARCH-04/05 и старые записи редакторского чата.

## 2. Автоматизированная проверка ссылок — [PR #84](https://github.com/ArrakturIL/regional-osint-feeds/pull/84)

Построен **консервативный статический граф**, который можно получить локально командой `node scripts/audit_legacy_dependencies.mjs` (JSON) либо `node scripts/audit_legacy_dependencies.mjs --summary` (краткая сводка). Работает без сети и БД: читает manifests frontend, исполняемые скрипты, относительные JS import/re-export/new URL/require, GitHub CI команды запуска старых тестов и frozen baselines. Любая неизвестная динамическая ссылка трактуется как **не доказано, что можно удалить**, а не как разрешение на чистку.

**Фактические результаты по [CI #44000702098](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/44000702098), head `419e1c4480aaa89ccce0d027f79936f242f6ef36`:** просканировано **223 source-файла и 505 разрешённых статических связей**; **14** исторических CI тестов `worker/test-*.mjs` являются roots; из **31** Worker JS/MJS модулей **13** достижимы из исторических тестов, **14** — сами тестовые runners, а у **4** связь с этими тестами не обнаружена:
- `worker/live-editor/analysts-editor.mjs`
- `worker/live-editor/analysts-translation.mjs`
- `worker/live-editor/regional-watch-editor.js`
- `worker/live-editor/story-enrichment.mjs`

Эта четвёрка **НЕ признана мёртвой**: исторический live-editor entrypoint и дочерние модули могут быть rollback/reference-артефактом, отдельные CI workflow проверяют синтаксис и срабатывают на `worker/live-editor/**`. Их проверка не входит в модерный release bundle. Даже если в графе нет импортов из текущих тестовых roots, это недостаточно для удаления.

Также подтверждены **7 реально включённых JS `frontend/src/legacy/**` и 2 CSS**; frozen baseline Editor (13 файлов) и Monitor (2 файла) имеют действующих test consumers. Отсутствующих разрешаемых ссылок в проверенных JS imports — 0; вычисляемые строки, SQL/HTTP runtime calls, внешние GitHub Actions и CSS/HTML селекторы в графе не эмулируются.

**Структурная проверка этих четырёх:** `worker/live-editor/regional-watch-editor.js` импортирует `analysts-editor.mjs` и `story-enrichment.mjs`, а `analysts-editor.mjs` импортирует `analysts-translation.mjs`. Дополнительный **7-й** автоматический тест фиксирует цепочку и точный перечень, чтобы будущий PR не удалил архивный entrypoint или его дочерние модули незаметно. Критерия необходимости для rollback это само по себе не доказывает.

**TDD и состояние:** [RED #43999930193](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43999930193) — тест импортировал ещё отсутствующий analyzer; при первом implementation run [#44000053396](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/44000053396) нашли проблему обнаружения пути `editor-v64`, сконструированного по частям; исправлено без изменения production. [GREEN ARCH-06 7/7 tests в #44000702098](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/44000702098) подтверждены; full app / immutable release status сверять отдельно до объявления общей зелёной сборки. Изменения живут в **отдельном PR #84, ещё не merged/deployed**; продакшен и базы данных не менялись.

**Дальше:** проверить вручную и поведением 4 не покрытых старым CI файла, включая rollback значение; переносить только уникальные legacy-тесты на современные `backend/` модули; возможную архивацию делать отдельным TDD PR. Никакого автоматического удаления или переписывания старого Worker пока не делать.
