# REGIONAL WATCH — независимый разбор архитектуры переводов (задание Claude)

**Срез:** 16 ноября 2026, вечер (IL), состояние production; оценки и счётчики моментальные, не обещание постоянного состояния.
**Режим:** READ-ONLY экспертная проверка; **не вносить изменения в репозиторий, D1, Cloudflare, GitHub Actions или production**. Сначала закончить BACK; FRONT отдельно и позже.
**Репозиторий:** https://github.com/ArrakturIL/regional-osint-feeds — ветка `main`, исходный код брать непосредственно из актуального HEAD. Сайт: https://regional-watch.pages.dev и https://regional-watch.pages.dev/he/ .
**Контекст:** https://github.com/ArrakturIL/regional-osint-feeds/blob/main/docs/REGIONAL_WATCH_MASTER_TODO.md ; https://github.com/ArrakturIL/regional-osint-feeds/blob/main/docs/research/DEV_05_BACKEND_ARCHITECTURE_AUDIT_2026-11-16.md . Последние релизы переводов PR #70, #71, #72; #72: https://github.com/ArrakturIL/regional-osint-feeds/pull/72 . Этот документ — краткий handoff, не замена проверки source.

## 1. Что уже доступно: инфраструктура и инструменты

- **Cloudflare Free**, Pages + Workers: `backend/pages/src/index.js` (frontend/server), Editor Worker `backend/editor/src/index.js` (новости, локализация, аналитики), Monitor Worker `backend/monitor/src/index.js` (OSINT). Editor scheduled cron `*/5 * * * *`; Monitor `*/1 * * * *`; часть подзадач имеет дополнительное фазирование.
- D1 **NEWS** (`regional-watch-news`): `news_items` (`headline`, `summary`, `headline_ru`, `summary_ru`), `news_event_groups.representative_id`, `editorial_notes`, `regional_i18n` (кэш HE), `regional_i18n_attempts`, `regional_i18n_budget`, `news_translation_budget`, `official_translation_budget`, `official_translations`, `editor_state`.
- D1 **CORE** (`regional-osint`): `monitor_events` (досье/stories), `analyst_publications`, `analysts`, `regional_i18n`, `regional_i18n_attempts`. Публикационные контракты и provenance не менять.
- **Workers AI** с AI binding: общий **бесплатный лимит Cloudflare 10 000 neurons/UTC сутки на аккаунт**, не на функцию. Фактическое общее потребление необходимо смотреть в dashboard, локальные оценочные счётчики не равны точному общему расходу. См. https://developers.cloudflare.com/workers-ai/platform/pricing/ .
- **GitHub Actions**: независимый бесплатный/OSS-путь Helsinki-NLP перевода через news-localization mirror (`data/news-localization-mirror.json` и соответствующие workflows) + валидация при импорте в D1; Editor выполняет импорт примерно раз в 15 минут. Также есть Python/GitHub collectors, Neon и зеркала; не предполагать, что бесплатные GitHub минуты и внешний inference безграничны.
- Переводы обслуживают несколько **разных контуров**: RU news и IDF в `backend/editor/src/translations/scheduled.mjs`; HE news/editorial/story/analyst/profile в `backend/editor/src/localization/scheduled.mjs`; публичная локализация в `localization/read-core.mjs`, `news-reader.mjs`, `editorial-reader.mjs`, `stories-reader.mjs`, `analyst-api.mjs`, `news/api.mjs`. Дополнительные guard'ы — `translations/fact-guard.mjs`, `semantic-meaning.mjs`, `news-mirror.mjs::validateCandidate`, `localization/shared.mjs::fingerprint/sourceText`.

## 2. Текущие параметры и внутренние бюджеты (сверить с code)

| Контур | Модель/источник | Расписание и отбор | Локальный суточный предел |
|---|---|---|---|
| RU news headline + summary | Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | `translateTitles` во время scan Editor; high priority >=7 за 36 ч **или** опубликованный представитель `news_event_groups` score >=4 с `last_seen_ms` за 36 ч (PR #72). SELECT LIMIT 22, до 5 статей на запрос; фильтр рекламы; `validateCandidate` + semantic checks при чтении. | **20 пакетов/UTC день** или `estimated_neurons>=2500`. Дебет резервируется перед inference, обычная оценка 125 neurons, затем уточнение model usage. |
| HE news, editorial, analyst, story, profile | Workers AI `@cf/zai-org/glm-4.7-flash` | Scheduler раз в 5 мин; kinds round-robin `news, analyst, story, editorial, news, profile`; до 4 элементов/цикл. **HE news по-прежнему `priority>=7` за 7 суток**, в отличие от RU. | **112 attempts/UTC день** либо `estimated_neurons>=4000` (внутренние ворота). Quality confidence >=85, сохранность чисел/смысловых сущностей; повтор за те же сутки только transient internal 8004, `model_incomplete`, `model_invalid_response`, после >=30 мин и не более одного повтора/текущий SHA. |
| RU official IDF Telegram | та же Llama 3.3 Workers AI | `translateIDF`, подтверждённые `https://t.me/idfofficial/... `, до 3 источников/пакет, отдельный daily gate | **12 пакетов/сутки** или 1500 внутренних estimated neurons. |
| OSS backup/mirror RU/HE | Helsinki-NLP via GitHub Actions | отложенная очередь, импорт mirror ~15 минут, точную стратегию проверить в source | Зависит от GH workflow/моделей, без заявленного отдельного фиксированного производственного лимита. |

**Срез D1 за 2026-11-16:** RU `news_translation_budget` = **20/20**, reported estimated neurons ~**1401**; HE `regional_i18n_budget` = **112/112**, reported estimated neurons ~**500**. ЭТО НЕ достаточное свидетельство, что общий Cloudflare лимит 10k имеет запас: отчётность частичная и распределена по сервисам; проверить dashboard/ошибки. Вся система должна оставаться бесплатной без обязательного платного биллинга.

## 3. Подтверждённые проблемы

### A. Backlog / eligibility (из публичных REST и live D1)

- Срез **первых 40 новостей** по `/api/news?lang=ru&limit=40`: **30 pending, 10 available**. Иврит `lang=he`: **15 pending, 25 доступны** (из них 3 исходно HE). В ленте 351 event; эти 40 не являются статистикой по всем 351.
- Срез 96 самых свежих `news_event_groups` D1: **66 без RU headline**, 63 без RU summary (если нужна); HE absent cache у 32 не-HE материалов, 16 из 96 изначально на иврите. RU PR #72 исправил отбор видимых priority 4–6, но уже исчерпанный дневной cap означает отсутствие немедленного результата.
- **HE news scheduler до сих пор priority>=7**. В срезе текущих 96 не-HE без кэша 27 из 32 имели score 4–6; их scheduler систематически не выбирает. Есть наблюдения, что scheduler тратит попытки и на материалы с **исходным заголовком HE**, где HE уже нативен и перевод модели не нужен. Выяснить точное влияние и исправить экономно.
- Досье `/api/stories`: **RU 3/18 pending**, **HE 8/18 pending**. В CORE семь последних досье вообще без HE cache. Самостоятельного RU-переводчика англоязычных story, по имеющемуся коду, нет.
- Аналитика `/api/analyst-posts`: **HE 6/22 pending**, 16 available. Пять аналитических профилей HE доступны.
- Редакционные заметки `/api/editorial-notes`: 11 записей; у 10/11 валидный HE cache для заголовка и основного текста, **но** `verified_note` остаётся на русском/смешанном языке и `fieldLocale` маркирует всю заметку `pending` (10 заметок с кириллицей в evidence note). Важно НЕ скрыть проблему просто снятием поля из проверки, а определить предназначение `verified_note` и целевой контракт локализации; provenance/проверочные цитаты не менять на AI-выдумки.
- Строгая сверка source hashes среди кэша не показывает массовых stale hashes: в проверенных 351 репрезентативных событиях ~1 mismatch в оценке, у историй 0; root cause преимущественно missing cache/невыбранные элементы/низкая эффективность, а не общий SHA cache defect.

### B. Качество: ошибочная семантика при статусе «переведено»

**Конкретный production sample (оригинал и опубликованные версии):**
- EN: `Iran activates Isfahan's air defenses, home of uninspected enrichment facility, local media reports`.
- RU (фактически опубликовано): `Иран активирует противовоздушную оборону Исфахана, дом неопознанного обогатительного объекта, местные СМИ`.
- HE (фактически опубликовано): `איראן מפעילה את ההגנות האוויריות של איספהאן, ביתם של מתקן העשרה בלתי צפוי, דיווחי התקשורת המקומית`.
- Ошибки: `home of` => ошибочное «дом», `uninspected` => «неопознанный» / `בלתי צפוי` («неожиданный»), нарушены синтаксис и атрибуция «сообщают местные СМИ». `Исфахан` — русская форма названия; проверять написание всех топонимов.
- Пользователь указал появление `Хормузский` вместо принятого в русской новостной норме `Ормузский пролив`. Ищите точное место в текущих исходниках / данных; добавьте варианты топонимов, имён, организаций в глоссарий, но не заменяйте подстроки внутри других слов.
- Ещё sample HE: перевод сообщения Lebanese Forces о желании стать первым послом **Ливана в Израиле** превратился в фразу с обратным направлением `נציג הכוחות הלבנוניים מבקש להפוך ללבנון, השגריר הראשון של ישראל`; возможна потеря отношений субъект–объект.
- Пример с военной техникой: `ИЛ-76ТД` внутри HE записи содержит кириллицу (`ТД`), что вызывает `localization_complete=false`, хотя обозначение модели может требовать специального исключения; не лечить правилом «вся кириллица плохая» без учёта официальных названий.
- Полевые `validateCandidate`, `factualTranslationIssue`, `semanticMeaningIssue`, confidence/number-preservation **не гарантируют** качество топонимов, negation, actor roles, `uninspected`, модальности и атрибуции. Некоторые некорректные переводы помечены `available`. Дать точные regression tests на этих примерах.

### C. Повторные попытки, статусы и экономия

- HE errors по 16.11: `low_translation_confidence`, `numbers_changed_title/body`, `title:irgc_actor_missing`, `title:katz_name_corrupted`, `model_incomplete`, `8004: Internal server error`; ошибки встречаются и у CORE analyst/story. Только transient retries исправлены PR #71; плохие переводы не должны получать бесконечные запросы.
- RU/HE Cron и локальные caps останавливают попытки раньше предполагаемого «есть свободные токены». Рассчитать действительный throughput/возраст pending по категориям и прогноз при бесплатных квотах. Учитывать конкуренцию двух Workers AI моделей, IDF и других задач на общем 10k neurons.
- Проверить source hash, идемпотентность, параллельные Cron/ручные запросы, атомарность бюджетов, refund/не-refund при API error, telemetry/quality state; не подменять `pending` статусом `available` без перевода.

## 4. Обязательное предложение для оценки: бесплатный Gemini Developer API

**Сейчас не подключен.** Пользователь намерен создать ключ **в Google AI Studio Free Tier, без карты и платного billing**. Не просить ни его, ни нас присылать ключ. Google документация:
- https://aistudio.google.com/api-keys
- https://aistudio.google.com/rate-limit
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/rate-limits
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemini-api/docs/billing

Для теста доступны по прайсу free `gemini-3.5-flash-lite` (в явном описании оптимизирован для переводов) и `gemini-3.6-flash`; фактические RPM/TPM/RPD **индивидуальны для проекта**, не заявлять устаревшие числа. На Free Tier Google **может использовать отправленные материалы для улучшения продуктов** — только публичные новости/OSINT, никаких закрытых источников, секретов, токенов или персональных данных. В платный тариф/биллинг без согласования не переходить.

Обсудить и сравнить по A/B тесту варианты:
1. Оставить Workers AI как primary, Gemini Free как ограниченный failover для низкой уверенности / высокого приоритета / исправления качества (с независимым validator и схематичным JSON);
2. Gemini как основной переводчик RU, Workers AI HE (или наоборот), с приоритетным обработчиком нужных для публичной страницы items;
3. Cheap deterministic glossary/pre- and post-process + оригинальный модельный перевод + отдельный semantic QA / rewrite, без создания цепочек, которые увеличивают цену и задержку.

Желательна **модульная provider abstraction** с конфигурируемой стратегией и feature flag, `GEMINI_API_KEY` как Cloudflare **Secret**, API fetch только server-side, per-provider quota/HTTP429 backoff/circuit breaker и независимые бюджетные counters, fail closed, rate-limit caps и законный Free Tier. Миграция только по согласию пользователя и после TDD/staging. Не предлагать «бесплатные модели», если фактически требуется кредитка/предоплата.

## 5. Задание Claude — независимая инженерная рецензия

1. **Самостоятельно открыть актуальный `main` и проследить полный путь**: RSS/original → storage/provenance → RU/HE translators/OSS mirror → guarded cache/source hash → event representative → публичные API → statuses. Просмотреть все релевантные backend-модули/тесты/workflows; отдельно Editor, Monitor, GitHub mirror; не ограничиваться этим handoff.
2. **Перепроверить каждый пункт выше**, отметить, что подтверждается source, что требует live read-only сверки и где наши предположения неверны. Указать **конкретные пути, функции и строки** и минимальные воспроизводимые тесты, выявить дополнительные defects. Если нет доступа к D1 — не выдумывать статистику.
3. Предложить **осуществимый оптимальный план P0/P1/P2**: реальные RU/HE translations везде, честные статусы, приоритет показанных событий и досье, HE native source, context-aware glossary (Ормуз/Исфахан), семантическое качество (localization QA), авторство/цитаты, ошибки модели, мониторинг/cooldowns/limits. Дать **примеры кода / псевдодиффы / тесты**, где это помогает; не делать коммиты.
4. **Оценить Gemini API**: какие доступные бесплатные модели; куда поставить в архитектуре; как проверить экспериментально качество на RU и HE, контроль слов и атрибуций; лимиты, приватность, handling 429 и 5xx, safety no paid, дополнительная нагрузка на Cloudflare D1/Workers, fallback/no single point of failure. Указать риски/компромиссы. Не считать структурированный JSON доказательством истинности перевода.
5. Сформировать **матрицу сравнения 20–50 реальных кейсов** для трёх способов: текущий Workers AI, Gemini (когда ключ станет доступен), OSS mirror, разметка `acceptable`/ `needs_review` по именам, топонимам, числам, смыслу, грамматике. Минимальный набор обязательно включает приведённые Isfahan/Ормуз/посол/техника/числовые/атрибуционные примеры.
6. **Вернуть отчёт мне, ChatGPT, в Crosswalk `b7strikeball-agents`**, желательно ответом в тред задания; пометить `for: ChatGPT` или номер `1111-5189-3658-5459`. Формат: root causes (со ссылками на конкретные файлы), исправления с risk/priority, Gemini recommendation, короткий план тестов и rollout. Полный отчёт/код можно приложить в `files/reviews/` Crosswalk; краткий verdict — текстом в ответ. Ни GitHub edits, ни deployment, ни реальной смены лимитов без прямого согласования.

**Критерий результата:** независимый, проверяемый вариант решения, который сокращает `pending` и повышает правильность RU/HE на реальных публикациях, оставаясь в бесплатных лимитах и не ломая backend→frontend контракты. Сначала совместно обсуждаем решение, после — TDD и релиз маленькими отдельными PR.

**Техпримечание:** Claude уже видит в этом Crosswalk ранее переданные файлы `current/MASTER_TODO_2026-11-16.md`, `current/DEV_05_BACKEND_AUDIT_2026-11-16.md`, `START_HERE_REGIONAL_WATCH_2026-11-16.md`. Они могут быть не последней версией `main`; источник истины — свежий GitHub HEAD.
