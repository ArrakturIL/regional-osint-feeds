# ARCH-07 — финальная техническая интеграционная приёмка, релизная граница

**17.11.2026, состояние на независимый контроль 03:09 UTC.**

**Итог:** локальная техническая интеграционная приёмка **ПРОШЛА**; **production release и проверка после него ещё не выполнялись**. Не помечать полный ARCH-07 `DONE` до согласованного merge/deploy и независимого post-release postcheck. Отложенные ARCH-04/05 идут самостоятельно 20 и 18 ноября; готовность их реальных данных нельзя вывести из тестового CI.

## 1. Кандидат и полные результаты CI

- [PR #84](https://github.com/ArrakturIL/regional-osint-feeds/pull/84), HEAD `7e73a07f6354cc5bca29d69001d140a24dfc8056`, все изменения исключительно в `tests/`, `backend/monitor/tests/`, `scripts/audit_*.mjs`, `.github/workflows/regional-watch-app-check.yml` и документах. **Нет production source modifications, схем/секретов/cron/публикаций.**
- [Полный GitHub Actions run #44008020669](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/44008020669): **COMPLETED SUCCESS**, 11 фактически исполнявшихся jobs (включая `release-bundle`) `SUCCESS`, два publish jobs `SKIPPED`; никаких успешных выкладок из этого PR.
- Существующий `tests/architecture/release-pipeline.test.mjs`: **11/11 PASS**, включая manifest source SHA и bytes, negative fail-closed Worker/Pages/preview, exact rollback версии, D1 preflight, immutable workflow.
- Новый `tests/architecture/arch07-integration-acceptance.test.mjs`: **6/6 PASS** на текущем модульном коде:
  1. Actual Pages→Monitor API через настоящие `handlePages` и `monitor.fetch`, EASA official RU/HE advisory; сырой ADS-B и fixture-secret не выдаются.
  2. Четыре public aviation/satellite RU/HE routes fail-closed `display_policy=hide` без свежего publishable primary-source evidence.
  3. Pages блокирует private `/summary`, Editor queue и неизвестные API, даже с `Authorization`; Monitor direct summary требует Bearer и не читает D1 до проверки.
  4. Missing Editor/Monitor service binding выдаёт `503 upstream_unavailable` и `Cache-Control: no-store`, не подменяет отказ пустой публичной лентой.
  5. 84 production modules, 218 direct import edges, согласованные Pages/Editor/Monitor D1/AI/services/cron и все восемь Neon→D1 collector contracts.
  6. Full release gate order: exact immutable artifact and matching checked-out SHA → credentials → D1 schema read-only → rollback baseline **до любых записей** → Editor → Monitor → Worker postcheck → Pages → routes smoke → final postcheck / receipt → exact version rollback on failure.
- Workflow final gate теперь выполняет все 6 acceptance тестов **перед** immutable `scripts/release/build.mjs` / `verify.mjs`, двумя Wrangler `--dry-run` и загрузкой единого immutable artifact.
- Реальная сборка в run: **21 immutable files**, exact CI source SHA `3c56ce8f8580391adc8c468bd13a66e8449219bb` (GitHub Actions `pull_request` checkout использует синтетический merge SHA, отличающийся от PR HEAD), `verify.mjs` SUCCESS. Оба Worker `wrangler deploy --dry-run` SUCCESS. Набор `rw-unified-release-bundle` сохранён, artifact expiry зависит от GitHub retention policy.
- Первый новый CI run #44007858503 упал из-за **синтаксической ошибки в добавленном тестовом fixture** (`prepare(sql){return{sql}};`). Исправлен **только тестовый файл**; второй run #44008020669 green. Это не подтверждённая regression production-кода и не стоит выдавать за полноценный TDD RED-GREEN поведения.

## 2. Независимая проверка реального Cloudflare, без изменений

Cloudflare read-only control plane, 17.11.2026 ~03:03 UTC:
- Pages project `regional-watch`, production branch `main`, canonical production deployment `a7090239-de5b-40ed-801e-1fce1f65edff`, stage `success`, trigger source commit `24875a8ef81da1b8632064b6d24b9e9e8e44fdd9`. **Это существующая production версия, не PR #84.**
- Editor `regional-watch-editor` deployed version `67faadeb-140c-4249-b5b2-eee50ee75469` **100%**, cron `*/5 * * * *`, `AI`, `CORE_DB`, `NEWS_DB`, existing runtime var `REGIONAL_EDITOR_CACHE_SOURCES`, compatibility `2026-11-10`.
- Monitor `regional-osint-monitor` deployed version `a608171b-6a41-4c28-b3cf-04b6881249cb` **100%**, cron `*/1 * * * *`, `DB`, existing 4 secret bindings + source vars, compatibility `2026-11-10`.
- Pages service bindings `EDITOR` и `MONITOR`, D1 bindings `DB` и `NEWS_DB` совпадают с `deploy/release-contract.json` по именам и IDs; обе Worker preview URLs отключены.
- Независимые запросы `PRAGMA table_info(...)` к production Cloudflare D1 (read-only SQL): **6/6** обязательных таблиц, **0 отсутствующих обязательных столбцов**: `regional_collector_cache`, `observations`, `analyst_items` (core); `news_items`, `regional_translation_repair_backups`, `regional_i18n` (news). Никаких SQL-изменений/миграций/значений строк не читали.
- **Ограничение:** прямой внешний HTTP smoke `regional-watch.pages.dev` в текущем инструментальном окружении недоступен (DNS/URL access failure). Не утверждать, что HTTP/E2E тест production прошёл в этом прогоне. GitHub scheduled `live-production-smoke.yml` существует, но самостоятельное актуальное выполнение здесь не подтверждалось. Независимый control-plane/D1 postcheck не заменяет API smoke **после** нового развёртывания.

## 3. Состояние, ожидающее release gate

**ARCH-07 технические пункты:** code/source contracts ✅; 11 existing release unit tests ✅; 6 new full three-service acceptance ✅; 11 green jobs ✅; 21-file immutable build+verify ✅; two Worker dry-runs ✅; independent live control-plane/D1 schema check ✅.

**Пока НЕ выполнено:** `PR #84 → main` merge, coordinated Pages+2 Workers publish, captured before/after version/deployment receipt, post-release live API + active production gate и rollback проверка фактической версии по необходимости. После явного согласования release выполнить корректный GitHub process без ручной выкладки и затем независимую проверку. Отдельную `ARCH-04/05` приёмку не менять и не дублировать.

**Решение по TODO:** `ARCH-07 [~]` — техническая приёмка готова, ожидает контролируемого release/postcheck. Не писать `[x]` только на основании зелёного PR CI. Продуктовые B/C/E и глобальный frontend/browser QA остаются независимыми.
