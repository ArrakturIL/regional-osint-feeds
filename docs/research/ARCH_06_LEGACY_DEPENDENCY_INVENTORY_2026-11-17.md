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
