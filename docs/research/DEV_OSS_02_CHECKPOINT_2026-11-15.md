# REGIONAL WATCH — DEV-OSS-02 checkpoint (15.11.2026)

## Последний законченный блок

- **DEV-OSS-02** = изолированный trial небольших XML/HTML/языковых средств; подробный [отчёт](./DEV_OSS_02_TRIAL_RESULTS_2026-11-15.md). Цель скрининга выполнена, integration/release **не выполнены** и не разрешены этим результатом.
- Source of truth: `main` [MASTER TODO](../REGIONAL_WATCH_MASTER_TODO.md).
- Изолированный эксперимент: GitHub **draft [PR #35](https://github.com/ArrakturIL/regional-osint-feeds/pull/35)**, branch `trial/dev-oss-02-parsers-20261115`, HEAD `80e5a418d5e04b9865920f8d6c17261c104517a9`. PR **не объединять** автоматически; нет secret/DB/Worker writes.
- Последний job [#43761894563](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43761894563) **SUCCESS**, 11/11 тестов, 0 failures. Test-only XML bundle: 148609 Б raw, 66541 Б minified, Node sample ≈70.544 ms / 1000. Не экстраполировать на Workers Free CPU.
- `franc-min` EN/RU/AR = eng/rus/arb, HE=und, mixed=fra. Следовательно, он не годится как единственный language detector. Native script probe с conservative unknown корректно отклоняет смешанный пример, но не внедрён.
- `Intl.Segmenter` RU/HE/EN/AR: 2/2 предложений в 4 синтетических образцах. `Cheerio` извлёк 846 символов; Readability + jsdom — 825; нет source permissions или real HTML proof. Lexical overlap related=0.714 и **contradictory=0.714** — риск ошибочного объединения противоположных утверждений.
- Current production release `scripts/release/build.mjs` использует **esbuild modern Monitor**, тогда как `backend/monitor/scripts/build.mjs` остаётся legacy concat. Перед реальным внесением npm зависимости потребуется совместимость обоих путей либо согласованное изменение проверки.
- Никаких новых оплачиваемых сервисов, Cloudflare AI, новых LLM, production builds и API ключей.

## Возобновление — только по новой команде

Следующий приоритет по MASTER TODO — **DEV-OSS-03** (не-LLM QA существующего Cloudflare AI), но пользователь запретил автоматическое начало следующего блока. Время/источник/качество ошибок переводов и полная многозадачная QA — отдельные процессы. Подключение `fast-xml-parser` в production оставить под отдельный gate (реальная разрешённая RSS-фикстура, Workers CPU, TDD, full CI, coordinated release и rollback), не выдавать trial как релиз.

**Правило: один блок → тесты → TODO → отчёт → стоп.**
