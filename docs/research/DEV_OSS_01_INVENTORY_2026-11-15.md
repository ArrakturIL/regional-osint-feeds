# REGIONAL WATCH — DEV-OSS-01. Инвентаризация бесплатного OSS-стека
**Дата:** 15.11.2026 (Asia/Jerusalem)  
**Результат блока:** каталог изучен; кандидаты сопоставлены с текущими модулями; расставлены решения и обязательные инженерные проверки. **Это НЕ установка или релиз.**  
**Авторитетная очередь:** [MASTER TODO](../REGIONAL_WATCH_MASTER_TODO.md).

## 1. Источники, границы достоверности и правила

Проверен полный исходный документ из **Library** с точным заголовком «Regional Watch: бесплатный и open-source стек для мониторинга, OSINT, анализа сырой информации, переводов и проверки достоверности» (291 строка), а также `REGIONAL_WATCH_RESEARCH_CONTEXT_2026-11-15.md` и актуальный MASTER TODO. Исходное исследование — **каталог идей**, а не согласованное техническое задание: оно проектировало собственные Postgres/Redis/Qdrant, локальные LLM и серверы перевода. Наша уже работающая система — **GitHub + Cloudflare Pages/Workers/D1 + Neon Free + существующий Cloudflare AI**. Новая инфраструктура и отдельные модели не разрешены.

**Факты в этом документе имеют два уровня:**
- **Verified:** прочитаны файлы `main` или первичный npm/GitHub/Cloudflare/GitHub Docs на 15.11.2026. Ссылки приведены ниже.
- **Catalog-only:** источник — большой отчёт Library, но лицензия/доступ конкретного отложенного продукта **не проверялись отдельно**. Это НЕ разрешение на внедрение: перед выбором перепроверить upstream, ToS, версию и реальное потребление.

**Ни одна строка «TRIAL» не разрешает производственную установку**. Проба (RED→GREEN, bundle, CPU, стоимость, лицензии) принадлежит следующему **DEV-OSS-02** и последующим блокам. Общий QA сайта — отдельный процесс.

## 2. Текущее состояние кода main — уже сделано, не дублировать

| Текущая функция | Подтверждённый код | Статус |
|---|---|---|
| RSS/Atom в offline сборщиках | `scripts/collect_news_shadow.py`, `scripts/collect_analysts.py`: Python ElementTree, проверки доступности/размера/даты | **KEEP**; нет основания ставить другой Python XML stack |
| CENTCOM RSS внутри Worker | `backend/monitor/src/collectors/official/centcom-rss.js`: регулярные выражения `<item>`, `<title>`, `<link>`, `<pubDate>`, HTTP+source/date guards | **TRIAL** parser, поскольку regex не структурный XML разбор; безопасность/регрессии обязательны |
| Разбор публичного Telegram HTML | `scripts/collect_analysts.py`: `HTMLParser` + ограниченные allowlist/границы | **KEEP** до реальной фикстуры с доказанной потерей данных |
| Нормализация URL/строк | `backend/editor/src/news/normalization.mjs`: URL/HTTPS/tracking/hash removal/NFKC; `scripts/news_event_filter.py` и `scripts/collect_news_shadow.py` | **KEEP**, стандарты JS/Python уже используются |
| Кластеризация и разграничение источников | `scripts/news_event_filter.py` (shadow), `backend/editor/src/news/claim-identity.mjs`, `backend/editor/src/news/events.mjs` | **KEEP**, наличие кода не равно точности группировки |
| Переводы и базовая проверка | `backend/editor/src/analysts/translation.mjs`: Cloudflare AI, ограничения чанков, content-hash, проверка чисел/части отрицаний; `translations/fact-guard.mjs`, `semantic-meaning.mjs`, `scripts/translation_semantics.py` | **KEEP**; расширение качества — DEV-OSS-03, ошибки B-01/B-02 ещё открыты |
| Источники и репликация | `backend/monitor/src/collectors/` (AIS/ADS-B/GDELT/официальные/спутники); `scripts/sync_neon_primary_to_d1.py`; D1 read cache | **KEEP**; не повторять прошлую миграцию/подключение |
| UI/карты/графики | `frontend/src/` — работающий React и компоненты; нет доказательства потребности в отдельном map server | **KEEP**, не менять дизайн в этом блоке |

**Проверка установленности кандидатов:** поиск по исходникам `main` для `fast-xml-parser`, `franc-min`, `cheerio`, `papaparse`, `mammoth`, `maplibre` нашёл упоминания в планах/спеках, **не production импорты**. `Intl.Segmenter` в существующем прикладном коде не обнаружен. Не принимать найденное название в docs за установленный компонент.

## 3. Приоритетные кандидаты для маленьких изолированных испытаний

| Кандидат | Лицензия, версия и источник | Реальная задача; оценка совместимости | Решение |
|---|---|---|---|
| JS `URL`, Unicode `normalize`, Web Crypto, regexp | Стандарты платформы, без npm/API | URL и хэши уже есть; сравнивать edge cases RU/HE/AR, а не ставить дубликат | **KEEP native** |
| `Intl.Segmenter` | Встроенный Intl (наличие/локали проверить в target CI) | Границы предложений для HE/AR/RU/EN вместо разрезания по пробелу; качество не измерено | **TRIAL**, нулевая новая зависимость |
| `fast-xml-parser` | [npm v5.12.1, MIT](https://www.npmjs.com/package/fast-xml-parser), актуальный upstream [GitHub](https://github.com/NaturalIntelligence/fast-xml-parser) | CENTCOM RSS в Worker, namespace/CDATA/XML entities/неверный XML; parser заявляет ESM/browser compatibility, **real Worker CPU и обработка DTD/entities не проверены** | **TRIAL №1** |
| `rss-parser` | MIT по исходному каталогу; [npm](https://www.npmjs.com/package/rss-parser) — exact version перед пробой | Альтернатива для RSS/Atom; пакет Node ориентирован, поэтому Worker compatibility **не доказана** | **TRIAL в сравнении**, не обе библиотеки сразу |
| `Cheerio` | [npm v1.2.0, MIT](https://www.npmjs.com/package/cheerio) | HTML/CSS selectors для ограниченных публичных материалов; **Node/Actions прежде Worker**, проверить bundle и права на извлечение | **TRIAL только при реальном провале HTMLParser** |
| `@mozilla/readability` | [npm v0.6.0, Apache-2.0](https://www.npmjs.com/package/@mozilla/readability); npm версия без нового релиза ~2 года | Извлечение текста из DOM, нужен DOM-provider; результат НЕ безопасный sanitized HTML | **BACKLOG** после HTML fixtures |
| `franc-min` | [npm v6.2.0, MIT](https://www.npmjs.com/package/franc-min); обновление пакета ~3 года назад | Определение языка на реальных RU/HE/EN/AR, коротких/смешанных фрагментах; **abstain/unknown**, не auto-publish | **TRIAL** если эвристики не хватает |
| `transliteration` | [npm v2.7.0, MIT](https://www.npmjs.com/package/transliteration) | Только альтернативные поисковые ключи; латинизация **не** подтверждает имена/географию/перевод | **BACKLOG**, **REJECT для фактического отображения** |
| `minhash` / fuzzy string comparison / shingling | Версии/лицензии подлежащих выбору пакетов не закреплены; встроенные алгоритмы доступны | Exact-URL/hash уже есть, cross-language near-duplicate может быть дорогим и ошибочным | **TRIAL алгоритма** после фикстур false merges, не внедрять автоматически |
| `winkNLP` / `compromise` / `Natural` / `NLP.js` | MIT по исходному каталогу, детали по пакетам не перепроверены | Преимущественно EN и Node NLP; HE/AR поддержка не доказана, часть правил уже реализована | **BACKLOG**; тестировать только узкую незакрытую задачу |
| `@turf/turf` / точечные `@turf/*` | [npm v7.4.0, MIT](https://www.npmjs.com/package/@turf/turf), весь bundle содержит >100 зависимостей | GeoJSON geometry/distance, но нельзя автоматически подтверждать реальные события | **TRIAL отдельных пакетов** только по реальным гео-фикстурам |

**Первый рекомендуемый эксперимент после нового разрешения:** проверить один CENTCOM XML парсер на фиксированных примерах. Сохранять `title/url/published_at/source_feed/status` и origin checks, fail-closed на malformed/oversize/мнимые будущие даты; сравнить с исходным Worker parser. Проход на Node ≠ доказательство Workers Free 10 ms CPU. Это **план следующего блока, не выполненный тест**.

## 4. Полный каталог Deep Research: решение по классам и по каждому названному кандидату

Статусы: **KEEP** = уже есть/использовать действующее; **TRIAL** = короткая проверка на измеримую пользу, не релиз; **BACKLOG** = не требуется сейчас; **REJECT** = не включать в выбранную бесплатную архитектуру (возможна историческая справка). Группировка не означает принятие всех членов группы; **каждое перечисленное название получает одинаковый указанный статус**.

| Область / конкретные кандидаты из исходного исследования | Решение | Обоснование/ограничение |
|---|---|---|
| Python `ElementTree`, `HTMLParser` и действующие HTTP/source-normalizers | **KEEP** | уже в сборщиках; не ставить «на всякий случай» |
| `Crawlee`, `Playwright`, `Puppeteer`, `jsdom`, `trafilatura`, `Postlight/Mercury Parser` | **BACKLOG** | браузер/Node/Python CPU, нет доказанной необходимости, проблемы поддержки/прав источников |
| `changedetection.io`, `Huginn`, `RSSHub`, `FreshRSS`, `Miniflux`, `Feedpushr`, `Feed2toot`, `RSS-Bridge`, `PolitePol`, `Kill the Newsletter`, `FiveFilters Feed Creator` | **REJECT** как новые сервисы для текущей архитектуры | дополнительный self-hosting, администрирование и network terms; можно использовать внешние разрешённые feeds отдельно. RSSHub и FreshRSS — AGPL-3.0 |
| `Apache Tika`, `Unstructured`, `Apache POI`, `Tesseract OCR`, `PaddleOCR` | **BACKLOG** | тяжёлый offline parser/OCR; при реальном разрешённом документе тестировать на Actions, а не в Workers |
| `pdfjs-dist/pdf.js` | **BACKLOG**, [npm v6.5.438 Apache-2.0](https://www.npmjs.com/package/pdfjs-dist) | большой PDF требует RAM/CPU; перед внедрением нужны формат, права и точный тест |
| `pdf-parse`, `SheetJS CE`, `xml2js`, YAML parsers | **BACKLOG** | сначала официальный разрешённый пример и сравнение со встроенным Python/JS парсером; лицензия/версия отдельного пакета не проверены |
| `Mammoth.js` / `mammoth` | **BACKLOG**, [npm v1.12.2 BSD-2-Clause](https://www.npmjs.com/package/mammoth) | DOCX→semantic HTML, нужен реальный документ |
| `PapaParse` | **BACKLOG**, [npm v5.7.1 MIT](https://www.npmjs.com/package/papaparse) | для реального CSV/TSV feed, не ставить без входа |
| `ExifTool`, `FFmpeg/ffprobe`, `ImageMagick`, `OpenCV`, `sharp`, perceptual `pHash/dHash/aHash` | **BACKLOG** | медиа-обработка только offline с правами на содержимое; metadata/hash не доказывают подлинность |
| `yt-dlp`, `gallery-dl`, `Instaloader`, `Bellingcat Auto Archiver` | **BACKLOG** | можно исследовать ограниченное законное архивирование; ToS, права на видео/посты, размеры и секреты до запуска |
| `Whisper/faster-whisper` | **REJECT** для текущего runtime, справочный резерв | CPU/GPU для транскрипции без бесплатного постоянно работающего сервера |
| `GramJS` | **REJECT**, архивирован 14.07.2026 | даже активный fork не даёт права автоматически собирать приватные данные |
| `teleproto`, `Telethon`, `Pyrogram`, AT Protocol SDK, Mastodon API, `twarc`, Reddit/PRAW, ActivityPub clients | **BACKLOG** | не менять существующие публичные Telegram/YouTube previews; нужны permissions/ToS/source-specific evidence |
| `OPUS-MT`, `Marian NMT`, `CTranslate2`, `Bergamot`, `Argos Translate`, `LibreTranslate`, `MADLAD` | **REJECT для текущего релиза** | исходное исследование предлагает новые *модели/серверы*, но пользователь прямо требует сохранить Cloudflare AI и не покупать VPS/GPU |
| `NLLB`, `SeamlessM4T v2` | **REJECT** | у обсуждённых в каталоге checkpoint лицензия CC-BY-NC; конкретную модель и права перепроверять перед любым иным использованием |
| `Transformers.js`, `spaCy`, `GLiNER`, `fastText`, `Sentence Transformers`, `ml-kmeans/ml-hclust/ml-dbscan` | **BACKLOG** | требует данных/CPU и проверки языка; original fastText repo архивирован — не новая dependency по умолчанию |
| `Ollama`, `llama.cpp` | **REJECT для текущего релиза** | не заменять Cloudflare AI и не добавлять локальный LLM-хост |
| `Qdrant`, `OpenSearch`, `Meilisearch CE`, `Typesense Server`, `pgvector` | **REJECT как новая инфраструктура сейчас** | хранение уже работает Neon/D1, отдельный search/vector node не обоснован |
| `GDELT Events` + существующий `gdelt_context` | **KEEP** | источники уже существуют; coded news signals ≠ подтвердившиеся события |
| `GDELT Mentions`, `Media Cloud`, `ClaimReview/schema.org` | **TRIAL на read-only источниках после licensing/API gate** | потенциально улучшат цепочку цитирования и независимость; сначала проверка настоящего источника и rate limits |
| Google Fact Check Tools API | **BACKLOG** | нужен API key, гарантированный бесплатный бюджет и правила доступа не подтверждены |
| `Common Crawl`, `Wikidata`, `Wikipedia dumps`, `OpenAlex`, `DBpedia`, `GeoNames`, `Internet Archive CDX/Wayback` | **BACKLOG** | под конкретное enrichment/provenance, не mass sync |
| `OpenAleph`, OCCRP Aleph Pro | **REJECT как новый сервер/hosted entitlement** | self-hosting отдельно от закрытого/по заявке доступа к данным |
| Bellingcat Online Investigation Toolkit, InVID/WeVerify | **BACKLOG как ручный справочник** | осмысленный human verification, но не новый автоматический Worker |
| Google Lens, Bing Visual Search, Yandex Images, TinEye | **BACKLOG, ручное исследование** | не делать вид, что есть бесплатные стабильные production APIs |
| `MapLibre GL JS` | **BACKLOG**, [npm v6.18.0 BSD-3-Clause](https://www.npmjs.com/package/maplibre-gl) | рендерер бесплатен; tiles/hosting условия отдельно, UI изменение не требуется |
| `Pelias`, `Photon`, `Nominatim self-hosted`, `Overpass self-hosted` | **REJECT как новые сервисы** | memory/CPU+OSM indexes, не в текущих квотах |
| OpenStreetMap data/public APIs, Natural Earth, OpenHistoricalMap, Sentinel/Copernicus, NASA FIRMS | **KEEP** для уже подключённых NASA/Copernicus; прочее **BACKLOG** | свободная база ≠ безлимитный публичный API, проверить лицензии и attribution |
| `Apache AGE`, `Neo4j CE`, `JanusGraph` | **REJECT как новые графовые серверы** | текущие links/relations можно вести в существующем DB без долгоживущего graph runtime |
| `BullMQ/Redis`, `Temporal`, `Node-RED`, `n8n` | **REJECT как дополнительный orchestration runtime** | GitHub Actions/Cloudflare cron уже работают; n8n Sustainable Use **не OSI OSS** |
| `React` | **KEEP** | существующий frontend |
| `Next.js`, `TanStack Query/Table`, `Cytoscape.js`, `Sigma.js`, `TimelineJS`, `vis-timeline`, `ECharts`, `Recharts`, `D3`, `OpenSearch Dashboards`, `Grafana`, `Metabase`, `Superset` | **BACKLOG** | UI инструменты только если подтверждена нужда; Dashboard servers потребуют хостинг |

## 5. G-09: лицензии, сопровождение и эксплуатационные риски

**Проверенные upstream (не по памяти):**
- [rsshub repository](https://github.com/DIYgod/RSSHub) — AGPL-3.0; [FreshRSS](https://github.com/FreshRSS/FreshRSS) — AGPL-3.0, оба требуют сервера. Это НЕ причина считать их платным API, но это причина **не внедрять** без необходимости/лицензионного анализа.
- [n8n official licensing FAQ](https://support.n8n.io/article/can-i-use-your-license-for-my-use-case) — Sustainable Use License, community self-host может быть бесплатным в рамках условий, но не OSI-OSS. Исключено из текущего стека.
- [GramJS archive](https://github.com/gram-js/gramjs) — archived 14.07.2026, README направляет в teleproto. **REJECT** GramJS.
- [ExifTool авторский README](https://github.com/exiftool/exiftool/blob/master/README): «same terms as Perl», **Artistic или GPL**; прежнее упрощение «только GPL-3.0» в большом отчёте некорректно. `LICENSE` в mirror содержит GPL-3.0; при будущей дистрибуции проверить выбранные условия и attribution.
- [yt-dlp upstream](https://github.com/yt-dlp/yt-dlp) — source Unlicense, некоторые бинарные дистрибутивы включают GPLv3+/ISC/MIT third-party. Не путать лицензию кода и контента видео.
- [FFmpeg license](https://github.com/FFmpeg/FFmpeg/blob/master/LICENSE.md) — LGPL по умолчанию, при `--enable-gpl` и некоторых сборках GPL; сборки с `--enable-nonfree` могут быть нераспространяемы.
- [Bellingcat Auto Archiver](https://github.com/bellingcat/auto-archiver) — MIT, [релиз 1.2.9 от 01.09.2026](https://github.com/bellingcat/auto-archiver/releases); использование платформенных API/архивов регулируется отдельными условиями.
- [NLLB checkpoint](https://huggingface.co/facebook/nllb-200-distilled-600M) и [SeamlessM4T-v2 checkpoint](https://huggingface.co/facebook/seamless-m4t-v2-large) — только catalog risks: конкретные weights и применимость к коммерции перепроверять отдельно; модели в текущий план **не входят**.
- **Каталог-only, не upstream verified:** оставшиеся невыбранные проекты (Postlight/Mercury, fastText, minhash ecosystem, Pelias/Photon, graph servers, n8n alternatives и др.) — лицензии/versions из первоначального отчёта не являются достаточными для installation gate.

## 6. Проверенные бесплатные платформенные ограничения

- [Cloudflare Workers limits, 13.11.2026](https://developers.cloudflare.com/workers/platform/limits/): Workers Free **100 000 requests/day**, **10 ms CPU/request и 10 ms CPU/cron invocation**, 128 MB RAM, 50 subrequests/request. Network wait не входит в CPU. **Это НЕ измерение остатка доступной квоты Regional Watch.**
- [Cloudflare Workers AI, pricing 12.11.2026](https://developers.cloudflare.com/workers-ai/platform/pricing/): 10 000 neurons/day Free, далее операции при превышении лимита на Free падают. Cloudflare AI **сохранить**.
- [GitHub standard hosted runners](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job): для *публичного* репозитория standard runners бесплатны (с техническими ограничениями), что позволяет bounded offline job без отдельного VPS/GPU.
- Не считать free software = free persistent hosting. Любое новое API/внешний сервис может иметь ключ, ToS, rate limiting; в этой инвентаризации не включали новые платные сервисы, не затрагивали секреты и не меняли подписки.

## 7. Результат, критерии следующего блока и остановка

**Завершено именно в DEV-OSS-01:** прочитан полный исходный Deep Research, проверен рабочий код main, выделены существующие механизмы, полный каталог классифицирован в KEEP/TRIAL/BACKLOG/REJECT, реальные лицензии и даты выбранных npm-кандидатов и рискованных лицензий сверены по upstream, обозначены free runtime ограничения. Это **решения о приоритете**, не о качестве модулей.

**Ещё НЕ сделано и НЕ должно называться выполненным:** фактические A/B benchmarks, Worker bundle/CPU, RU/HE/EN/AR regression fixtures, install, implementation, CI, PR release, production source QA, full UI QA, проверка лимитов конкретного аккаунта. Они принадлежат DEV-OSS-02…05 и отдельному QA.

**Следующий кандидат после отдельного разрешения:** `fast-xml-parser` vs текущий CENTCOM regexp parser (и, если оправдано, `rss-parser`). Первый gate — реальная воспроизводимая ошибка/отсутствующее поле на immutable XML fixtures, RED до исправления; затем GREEN + existing Monitor suite, bundles, Cloudflare CPU, fallback и проверка downstream statuses. Без доказанной пользы — оставить старый код и не вводить зависимость.

**Режим:** после обновления MASTER TODO и этого отчёта **остановиться**. Не выполнять DEV-OSS-02/03/04/05 автоматически.
