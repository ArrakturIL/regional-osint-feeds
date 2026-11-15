# REGIONAL WATCH — DEV-OSS-01: инвентаризация бесплатных инструментов (15.11.2026)

**Статус:** инвентаризация исходников и проверка реестра npm завершены для указанных в таблице пакетов; A/B совместимости и качества пока не проведены, интеграции в production нет.  
**Основной TODO:** [REGIONAL_WATCH_MASTER_TODO.md](../REGIONAL_WATCH_MASTER_TODO.md).  
**Предел полномочий этого документа:** read-only аудит исходников + проверка каталога кандидатов; никаких новых API-ключей, хостинга, миграций, npm installs, правок Workers или источников в production.

## На чём основано

Проверены текущие файлы main: backend/monitor/src/collectors/official/centcom-rss.js, backend/monitor/src/utils/text.js, scripts/collect_analysts.py, scripts/collect_news_shadow.py, backend/editor/src/news/normalization.mjs, backend/editor/src/news/claim-identity.mjs, scripts/news_event_filter.py, backend/editor/src/analysts/translation.mjs, backend/editor/src/translations/fact-guard.mjs, backend/editor/src/translations/semantic-meaning.mjs, scripts/translation_semantics.py и package.json четырёх модулей.

Дополнительно прочитан личный контекст исследования REGIONAL_WATCH_RESEARCH_CONTEXT_2026-11-15.md. **Полный отдельный отчёт Deep Research с названием «Regional Watch: бесплатный и open-source стек…» не удалось извлечь из доступной Library в этой сессии**. Поэтому эта таблица покрывает кандидатов из актуального MASTER TODO и контекстного файла, а не выдаётся за окончательную построчную сверку исходного большого отчёта. Пункт DEV-OSS-01 / G-01 остаётся частично выполненным до этой сверки и экспериментальных замеров.

## Что уже есть — не устанавливать второй раз

| Возможность | Реальный код main | Вывод |
|---|---|---|
| URL, tracking removal, Unicode NFKC | backend/editor/src/news/normalization.mjs; scripts/news_event_filter.py; scripts/collect_news_shadow.py | Уже есть; доработки по тестам, без обязательного нового npm-пакета |
| Консервативная дедупликация/кластеризация статей | scripts/news_event_filter.py (shadow) и backend/editor/src/news/claim-identity.mjs | Уже есть; **не путать** с независимым подтверждением события |
| Разбор RSS/Atom | scripts/collect_news_shadow.py и scripts/collect_analysts.py используют Python ElementTree; backend/monitor/src/collectors/official/centcom-rss.js использует JS regexp | Python уже способен читать XML; проверка новой библиотеки нужна прежде всего для рискованного regexp-парсинга Worker |
| HTML-парсинг Telegram/превью | scripts/collect_analysts.py (HTMLParser с ограничениями и allowlist) | Не заменять без проверенной полноты/безопасности |
| Контроль перевода и атрибуции | backend/editor/src/analysts/translation.mjs (Cloudflare AI, hash/cache и числа); translations/fact-guard.mjs, semantic-meaning.mjs; scripts/translation_semantics.py | Есть; текущие проверки не равны достоверности; кейсы P1 остаются на независимый QA |
| Source status, hash, freshness и fallback | backend/monitor/src/mirrors/collector-cache.js; scripts/sync_neon_primary_to_d1.py | Уже в production; не запускать повторную миграцию |
| Aviation/AIS/спутники/GDELT | backend/monitor/src/collectors/ и scripts/collect_*.py | Есть первичные адаптеры; расширение только по gap и с provenance |

## Проверка версий и лицензий по первоисточнику (15.11.2026)

В момент первого черновика сведения о версиях npm не были подтверждены. Теперь проверена страница **npm package registry** для следующих кандидатов; версии ниже — снимок, а не автоматическое обещание совместимости с Workers.

| Пакет | Зарегистрированная версия | Лицензия npm | Актуальность публикации / ограничение | Источник |
|---|---:|---|---|---|
| `fast-xml-parser` | 5.12.1 | MIT | свежий релиз; JS ESM/browser по README. В v5 есть обработка entities/DOCTYPE: **проверить безопасность untrusted XML и лимиты парсинга до использования** | [npm](https://www.npmjs.com/package/fast-xml-parser) |
| `cheerio` | 1.2.0 | MIT | последняя опубликованная версия около 10 месяцев назад, зависимостей больше чем у узкого XML-парсера | [npm](https://www.npmjs.com/package/cheerio) |
| `@mozilla/readability` | 0.6.0 | Apache-2.0 | последний npm релиз около 2 лет назад; upstream **не очищает небезопасный HTML**, для вывода нужна отдельная санитизация | [npm](https://www.npmjs.com/package/@mozilla/readability), [Mozilla upstream](https://github.com/mozilla/readability) |
| `franc-min` | 6.2.0 | MIT | последний npm релиз около 3 лет назад. Поддержка mixed/коротких HE/AR **не доказана** | [npm](https://www.npmjs.com/package/franc-min) |
| `transliteration` | 2.7.0 | MIT | свежий релиз; 1:1 Unicode mapping, не надёжное восстановление имён | [npm](https://www.npmjs.com/package/transliteration) |
| `papaparse` | 5.7.1 | MIT | свежий релиз; CSV/TSV без сетевого API | [npm](https://www.npmjs.com/package/papaparse) |
| `pdfjs-dist` | 6.5.438 | Apache-2.0 | свежий релиз; большой PDF в Worker не проверен, резерв — offline Actions | [npm](https://www.npmjs.com/package/pdfjs-dist) |
| `mammoth` | 1.12.2 | BSD-2-Clause | свежий релиз; DOCX → HTML, не гарантия точного преобразования | [npm](https://www.npmjs.com/package/mammoth) |
| `@turf/turf` | 7.4.0 | MIT | недавний релиз; полная сборка имеет десятки зависимостей — выбирать точечные модули | [npm](https://www.npmjs.com/package/@turf/turf) |
| `maplibre-gl` | 6.18.0 | BSD-3-Clause | свежий релиз; картографические tile API и hosting имеют **отдельные условия** | [npm](https://www.npmjs.com/package/maplibre-gl) |

**Что ещё не подтверждено экспериментом:** размер dependency tree в нашей сборке, CPU на настоящем Cloudflare Worker, точность HE/AR, сравнительная полнота RSS/HTML, законность реального извлечения содержимого по каждому источнику, актуальный расход квот конкретного аккаунта. Лицензия npm не отменяет ToS источника.

### Бесплатность запуска — проверена документация провайдеров

- [Cloudflare Workers Free limits](https://developers.cloudflare.com/workers/platform/limits/): 10 мс CPU на HTTP/cron invocation, 128 MB RAM, 100 000 вызовов/сутки. Это **лимит**, не доступный остаток конкретного аккаунта.
- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/): 10 000 neurons/сутки бесплатно; превышение на Free блокируется, а не автоматически расширяет бесплатную квоту.
- [GitHub Actions — standard runner для public repo](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job): стандартные hosted runners для публичных репозиториев бесплатны, с техническими лимитами и отдельной квотой на хранение артефактов. Это подходит для **ограниченных offline обработок**, не требует VPS.
- Пользовательские аккаунтные остатки Workers/D1/AI/Neon в этом блоке не запрашивались и не подтверждались.

### Практический приоритет

1. Для CENTCOM RSS в Worker сейчас применяется regexp-извлечение, поэтому **первый A/B кандидат** — `fast-xml-parser` с фиксированными реальными входами и fail-closed. Тест сначала подтверждает конкретный дефект regex; затем кандидат должен устранить его без изменения публичных типов/дат/source attribution.
2. После реальной проверки — собственная нормализация/segmenter (без дополнительного npm), `franc-min` на RU/HE/EN/AR только с abstain/unknown, затем HTML и гео по выявленным проблемам.
3. На следующем DEV-OSS-02 **не устанавливать пакеты массово и не деплоить на production до RED→GREEN, bundle/CPU checks и согласованного release**.

## Оценка кандидатов (статусы: KEEP / TRIAL / BACKLOG / REJECT)

| Инструмент | Проверенная лицензия и активность | Бесплатная эксплуатация/совместимость | Решение и место применения |
|---|---|---|---|
| Встроенные URL / Unicode normalize / Web Crypto | Стандарт JS, без npm и отдельного API | Нет новых квот; очень низкая цена CPU | **KEEP**. Не дублировать существующее; на регрессиях проверить canonicalization, SHA, пробелы и смешанные RTL |
| Intl.Segmenter | Встроенный стандарт Intl; доступность проверить в target runtime CI | Нет API-тарифа, время CPU измерить | **TRIAL** для границ предложений/фрагментов RU/HE/EN/AR; сначала тесты против splitSource |
| fast-xml-parser | **MIT**, 5.12.1, релиз в ноябре 2026; [npm](https://www.npmjs.com/package/fast-xml-parser), [upstream](https://github.com/NaturalIntelligence/fast-xml-parser) | JS ESM / браузер; Worker совместимость, размер бандла и безопасные XML limits требуют прогона | **TRIAL №1** в изолированных Node/Worker-compatible фикстурах CENTCOM RSS; не менять Python ElementTree без выигрыша |
| Cheerio | **MIT**, 1.2.0; [npm](https://www.npmjs.com/package/cheerio), [upstream](https://github.com/cheeriojs/cheerio) | На GitHub Actions Node подходит, Worker-бандл и зависимости отдельно измерить | **TRIAL**, если текущий Python HTMLParser теряет реальные текст/дату/ссылку; не ставить в live Worker вслепую |
| @mozilla/readability | **Apache-2.0**, 0.6.0, опубликован ~2 года назад; [npm](https://www.npmjs.com/package/@mozilla/readability) | Нужен DOM; для непривилегированного HTML — sanitization и контроль прав на текст | **BACKLOG** после Cheerio и только для разрешённых первоисточников; не републиковать полный текст без прав |
| franc-min | **MIT**, 6.2.0, публикация ~3 года назад; [npm](https://www.npmjs.com/package/franc-min) | Без внешнего API, но возможны ошибки на коротких/смешанных HE/AR; требуется языковой датасет | **TRIAL** с возможностью abstain/unknown; не превращать эвристику в «подтверждённый язык» |
| transliteration | **MIT**, 2.7.0, активная публикация; [npm](https://www.npmjs.com/package/transliteration) | Без API; посимвольное отображение не решает имена и варианты написания | **BACKLOG** как вспомогательный индекс поиска; **REJECT** как источник фактических имён/топонимов для публикации |
| PapaParse | **MIT**, 5.7.1, активная публикация; [npm](https://www.npmjs.com/package/papaparse) | Дешёвый локальный CSV-парсер; пока нет обоснованного CSV production источника | **BACKLOG** до реального CSV fixture (авиация/морской/официальный реестр) |
| pdfjs-dist | **Apache-2.0**, 6.5.438, активная публикация; [npm](https://www.npmjs.com/package/pdfjs-dist) | Большие PDF/CPU: **offline GitHub Actions**, не minute-cron Worker | **BACKLOG** для конкретного разрешённого PDF и замера памяти/документов |
| Mammoth | **BSD-2-Clause**, 1.12.2, активная публикация; [npm](https://www.npmjs.com/package/mammoth) | Node Actions, документы DOCX; нет подтверждённого постоянного входа | **BACKLOG** |
| @turf/turf (предпочтительно отдельные @turf/*) | **MIT**, 7.4.0, активная поддержка; [npm](https://www.npmjs.com/package/@turf/turf), [docs](https://turfjs.org/docs/getting-started) | Полный пакет имеет много зависимостей; точечный GeoJSON алгоритм тестировать отдельно | **TRIAL** только для конкретного спутникового/гео-сопоставления с ground-truth; не обещать геолокацию по совпадению |
| MapLibre GL JS | **BSD-3-Clause**, 6.18.0, активная публикация; [npm](https://www.npmjs.com/package/maplibre-gl) | Библиотека бесплатна; tiles/hosting **не обязательно бесплатны** | **BACKLOG**, не менять текущую карту без цели UX/лимитов |
| ExifTool / FFmpeg / yt-dlp / Wayback-CDX | Лицензии/правила конкретных версий и источников **не проверены** в этой сессии | Offline, дорого по CPU/хранению; согласование ToS и прав на медиа обязательно | **BACKLOG**, никакого массового скачивания и обхода ограничений |
| GDELT Mentions / Media Cloud / Fact Check Tools | Условия API/доступ/квоты **не проверены** | Это внешние сервисы, не «бесплатная локальная библиотека» | **BACKLOG** отдельно от первой волны |
| Qdrant/OpenSearch/Whisper/локальные LLM/переводческие серверы | Не требуются для выбранной архитектуры | VPS/GPU/долгоживущие серверы нарушают текущую эксплуатационную рамку | **REJECT для этого релиза**, оставить только в историческом исследовании |

**Известная граница применимости:** поддержка RU/HE/EN/AR у парсеров означает обработку UTF-8, а не гарантированное лингвистическое качество. У franc-min и transliteration языковое качество отдельно недоказано. Разные версии npm-сайтов могут отражать разное время индексирования; перед установкой фиксировать exact version и lockfile.

## Лимиты и защита от неожиданных платежей

- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) (13.11.2026): Workers Free 100 000 запросов/сутки, **10 мс CPU на HTTP/cron invocation**, 128 MB memory, 50 subrequests; ожидание fetch не считается CPU. Не считать эти числа гарантированно доступным остатком аккаунта.
- [Workers AI Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/): 10 000 бесплатных neurons/сутки, далее Workers Paid; **существующую модель не заменять**.
- [D1 free limit enforcement](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/): с 01.09.2026 превышение daily read/write row limits вызывает ошибки, не автоматическое расширение квоты.
- GitHub Actions: реальное потребление, execution time, schedule и trigger-политики сравнивать по job artifacts перед включением постоянной обработки. Без runtime/GPU/VPS, новых токенов и платного сервиса.

## Приёмочные ворота первой реальной интеграции DEV-OSS-02

1. **RED:** заморозить реальные, разрешённые RSS/Atom фикстуры (namespaces, CDATA, escaped entities, non-Latin titles, 0 items, malformed XML, oversize, duplicate URLs, неполные даты). Сравнить current parser vs candidate: доля извлечённых полей/ложных новостей и fail-closed.
2. **GREEN:** только если candidate исправляет воспроизводимый дефект или снижает сложность при неухудшении выходного API, внедрить один адаптер в изоляции, с возможностью возврата к старому. Сохранить source_feed, title/url, published_at, проверку origin и stale/partial semantics. Никогда не выставлять unknown как 0 событий.
3. **Метрики:** CI Node tests, размер Worker bundle, CPU benchmark в окружении Workers (не равнять Node wall-time CPU), GitHub Actions duration, RU/HE/EN/AR fixtures. Если прироста нет — **KEEP native**, зависимость не добавлять.
4. **Релиз:** отдельный PR; CI RED→GREEN и coordinated release; проверить live source status/bindings после публикации. Глобальный UI QA — другая работа.

**Ближайший выбор:** один XML-парсер (fast-xml-parser) на пути CENTCOM RSS с регрессионными тестами, затем при подтверждённом результате — язык/текст. Никакого одновременного пакета из 10 библиотек.