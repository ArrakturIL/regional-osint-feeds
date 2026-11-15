# REGIONAL WATCH — DEV-OSS-02: результаты изолированных A/B-проб (15.11.2026)

**Блок:** проверка небольших бесплатных библиотек/встроенных методов для RSS/XML, HTML, определения языка, сегментации, нормализации и поиска текстовых повторов.  
**Исходные требования:** [MASTER TODO](../REGIONAL_WATCH_MASTER_TODO.md), [DEV-OSS-01 инвентаризация](./DEV_OSS_01_INVENTORY_2026-11-15.md).  
**Эксперимент:** [черновой PR #35](https://github.com/ArrakturIL/regional-osint-feeds/pull/35), ветка `trial/dev-oss-02-parsers-20261115`. **Не объединять этот PR с main как production-код.**  
**Последний подтверждённый CI:** [GitHub Actions #43761894563](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43761894563), `isolated-trial` SUCCESS: **11/11** offline Node tests, 0 failures, сборка candidate и сравнительные probes прошли. В CI **нет** Cloudflare credentials, продакшен-развёртывания или запросов к реальным источникам.

## 1. Результат в кратком виде

**Решение по DEV-OSS-02:** screening/лабораторный блок завершён, **новые зависимости в работающий Regional Watch НЕ внедрять автоматически**. На синтетических, но воспроизводимых входах подтверждены пробелы старого RSS regex и поведение кандидатов. **Фактическая точность на живой RSS/HTML выборке, лимиты CPU Workers Free и эксплуатационная стоимость НЕ измерены**. Подготовка к потенциальному внедрению относится к будущему release gate DEV-OSS-05, а не к этому эксперименту. Существующие source/translation/AI контракты не менялись.

## 2. Прямые сравнительные данные

| Компонент | Результат проверки | Решение |
|---|---|---|
| Существующий `centcom-rss.js` | Прогон **на точной исходной функции Monitor**, с изолированной offline заменой `get()`: 3/3 baseline checks. На синтетическом RSS возвращает текст `&amp;` вместо `&`; `<x:item>` не распознаёт; off-origin ссылки блокирует | **KEEP baseline** на production до реальной source fixture и CPU benchmark; найденные риски передать к интеграции |
| `fast-xml-parser@5.12.1` (MIT) | Candidate 5/5 tests: корректный RSS и XML entity decode, `<x:item>`, отбраковка DTD, malformed/oversize, внешнего URL и будущих дат, честный 30-day stale. Сборка esbuild browser-compatible успешна; отдельный test bundle **148 609 Б несжатый / 66 541 Б minified** (включая candidate+deps, не добавка к live Worker). 1000 синтетических parse ≈ **70,544 ms Node wall-time** в последнем CI (~0,071 ms/parse, **не Cloudflare CPU**) | **TRIAL → CONDITIONAL ADOPT**, только после live-source regression + Workers CPU + release contracts; не подключён |
| `franc-min@6.2.0` (MIT) | Один длинный пример: `eng` EN, `rus` RU, `arb` AR, **`und` HE**; смешанный текст классифицирован как **`fra`**. Датасет слишком мал для достоверной оценки частот ошибок, но эти два провала уже нарушают ожидаемое поведение | **REJECT для автоматического определения языка HE/mixed**; не подключать |
| Встроенный Unicode script heuristic | В тесте распознал RU/HE/EN/AR; после добавления conservative abstain при нескольких алфавитах mixed → **unknown**. Это только контрольный эксперимент, не production fix | **TRIAL**, предпочесть fail-closed/unknown, прежде чем печатать язык как факт |
| `Intl.Segmenter` | В каждом из четырёх синтетических RU/HE/EN/AR примеров выделил 2 предложения; без npm или API | **KEEP native / TRIAL** на длинных документах перед применением в chunks |
| Текущий `canonicalNewsUrl` | Удалил `utm_source` и URL fragment, сохранил значимый `ref=direct`; встроенный код уже есть | **KEEP**, новую библиотеку не ставить |
| `cheerio@1.2.0` (MIT) | Из статического искусственного `article` извлечено **846 символов**. Нет проверки по настоящим издателям или улучшения существующего публичного Telegram parser | **BACKLOG**, сначала реальный допустимый HTML кейс |
| `@mozilla/readability@0.6.0` (Apache-2.0) + `jsdom` | Из того же HTML выделено **825 символов** и заголовок. Требует DOM; сам Readability **не sanitizes untrusted HTML**, что upstream отдельно подчёркивает | **BACKLOG**, для ограниченного offline Actions path с sanitization/ToS только при необходимости |
| Token-set/Jaccard (без npm) | Один неизменный заголовок = 1, related headlines = **0.714**, заголовки `IDF confirms strike` и `IDF denies strike` = **0.714**. Высокий lexical overlap **не** доказывает один факт/событие | **REJECT как единственный критерий**; использовать лишь candidate linking + проверка действия/отрицания/атрибуции |
| `rss-parser`, `transliteration` | Нет нового доказанного выигрыша относительно существующих Python XML и native Unicode/URL модулей; отдельный A/B runtime не запускался | **BACKLOG**, не называть tested/installed |

**Важно:** только 11 тестов в конкретной trial CI (baseline воспроизводится 6 раз из-за его импорта, candidate — 5 проверок), а не 11 независимых реальных upstream samples. Ни одна синтетическая фикстура не доказывает, что у живого CENTCOM сейчас есть malformed XML/namespace. Источник не опрашивался; никакого source data не публиковалось.

## 3. Архитектурная проверка и совместимость

- `backend/monitor/scripts/build.mjs` по-прежнему делает **legacy конкатенацию** source order из `build-order.json` и не умеет импортировать внешние npm-модули как обычные ESM imports.
- Но **действующий unified production release** в `scripts/release/build.mjs` собирает modern Worker через **esbuild** (`backend/monitor/dist/worker.modern.mjs`); именно modern asset входит в release. Поэтому утверждение «production Monitor вообще не умеет npm» было бы неверным. Внедрение возможно, но legacy parity CI, зависимости, строящийся bundle и точный release digest требуют проверки.
- Тестовый browser-compatible bundle **не равен** реальной `wrangler` сборке в Cloudflare с ограничениями Workers Free. Ни actual CPU, ни память, ни cost/bindings в этом блоке не измеряли.
- Безопасность XML: проверять size, malformed, out-of-origin, даты, RSS structure. Candidate отвергает DOCTYPE/ENTITY целиком и ограничивает размер входа. Это защита экспериментального пути, не обещание полной стойкости к любому злонамеренному вводу.
- `fast-xml-parser` MIT, а upstream в 2026 исправлял ошибки CPU/entity expansion; использовать только закреплённую, отдельно проверенную версию и не снимать ограничения. [Upstream npm](https://www.npmjs.com/package/fast-xml-parser), [XML security advisory](https://github.com/advisories/GHSA-jmr7-xgp7-cmfj), [Mozilla Readability security](https://github.com/mozilla/readability#security).
- Не внедрять heavy stack, новые LLM/переводчики, платные облака, отдельный Redis/сервер или новый источник данных.

## 4. Приёмочные ворота перед внедрением (НЕ в этом блоке)

1. Получить **разрешённую неизменяемую реальную XML-фикстуру** из CENTCOM (или другой текущий легальный source), сохранить дату и provenance. Проверить реальную проблему, а не только синтетику.
2. Замерить реальное Workers CPU, network, bundle bytes `before/after`, расширенные malformed/RTL/encoding/CDATA случаи и сохранение API output. Результат должен укладываться в аккаунтные free лимиты, не в предположение.
3. Изолированный TDD RED→GREEN в настоящем модуле + full Monitor/editor/frontend CI, legacy build parity; release only through coordinated pipeline with receipt and rollback. Это относится к **DEV-OSS-05 / следующему разрешённому интеграционному выпуску**, не к текущему read-only эксперименту.
4. Для HE/AR language detection требуются десятки/сотни независимых размеченных примеров с false-positive и abstain rates. `franc-min` на текущих данных не допускается к auto-tagging.

## 5. Проверка целостности и стоп

- `main` в эксперименте не менялся до отдельного docs-only PR с этим отчётом; пользовательский сайт и real services не трогались.
- **PR #35 оставлен черновиком** (исходники эксперимента в удалённой ветке), не сливать с main без новой проверки/решения. Этот документ и чек-лист публикуются **отдельно, docs-only**, чтобы не запустить production coordinated release.
- Смысл результата: установленные production библиотеки — **0**, новых платных обязательств — **0**, новых внешних источников — **0**.
- После отчёта пользователю **остановиться**. DEV-OSS-03/04/05, DEV-02/03/04 и общий UI/News QA не начинать автоматически.
