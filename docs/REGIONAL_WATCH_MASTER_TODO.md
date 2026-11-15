# REGIONAL WATCH — единый актуальный TODO и карта документации

**Актуализация:** 15 ноября 2026, ~21:00 (Asia/Jerusalem). **Статус:** блок интеграции сборщиков/Neon/D1/GitHub завершён и проверен на реальных GitHub Actions; следующий GLOBAL-09 — только после команды пользователя.

> **Единственная актуальная очередь работ.** Старые QA-планы, архитектурные планы, исследования и чекпоинты остаются источниками доказательств и историей, но их незакрытые чекбоксы **не считаются** текущим состоянием автоматически. При каждом новом релизе проверять действительные версии и обновлять этот файл. «Код существует» ≠ «работает в production», «CI зелёный» ≠ «полный QA пройден».
>
> **Исполнение:** `@superpowers` (systematic-debugging → TDD → execution plan → verification-before-completion). Только точечные изменения с тестами, минимальным количеством агентов и проверяемыми артефактами. Документация здесь — не разрешение на релиз.

## ТЕКУЩИЙ БЛОК — ИНТЕГРАЦИЯ СБОРЩИКОВ / NEON / D1 / GITHUB (15.11.2026)

**Это действующее состояние, а нижние исторические разделы не означают необходимость повторять уже завершённый перенос.** Следующий блок берём **только после отдельной команды пользователя** по результатам данного.

- [x] **GLOBAL-01. Модульная архитектура вошла в `main`.** [PR #26](https://github.com/ArrakturIL/regional-osint-feeds/pull/26), исходные data snapshots сохранены; форсированного обновления истории не было.
- [x] **GLOBAL-02. Pages deployed.** Production Pages на `main`, RU/HE маршруты и работа прокси доказаны прежним live-smoke; preview существует, но использует общие production service bindings. Не считать preview полной изоляцией.
- [x] **GLOBAL-03. Neon-primary хранение и репликация.** [PR #28](https://github.com/ArrakturIL/regional-osint-feeds/pull/28) и [PR #29](https://github.com/ArrakturIL/regional-osint-feeds/pull/29) объединены с `main`; последняя интеграция commit `0b00b1be3d76ee04cdb37fdc725d6247a3f6d839`. Плановое задание читает только **8 валидированных Neon JSONB snapshots**, проверяет все данные до обращения к D1, не перечитывает замороженные GitHub JSON. Реальный production [Actions #43748774226](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43748774226): 54 теста OK, `replica_sync mode=neon_primary sources=8 d1_verified=8`, никаких git commits.
- [x] **GLOBAL-04. Восемь источников синхронизируются с SHA parity.** В production run #43748774226 полностью выполнена Neon-primary→D1 reconciliation 8/8. Независимая последующая сверка Neon SELECT / D1 SELECT подтвердила 8/8 совпадающих пар `data_sha256`/`status_sha256`. MARAD/NASA могут иметь более старое время **сбора** из-за расписания; это не ошибка репликации. `partial` и `stale` сохраняются честно.
- [x] **GLOBAL-05. Закрытый QA staging модульных Workers.** Отдельные версии Editor/Monitor загружены в Cloudflare: `regional-watch-editor-architecture-qa`, `regional-osint-monitor-architecture-qa`, без workers.dev/preview URLs и cron. Старый PR #27 с попыткой GitHub API-token staging теперь исторический/заменён прямым Cloudflare API.
- [x] **GLOBAL-06. Новый Editor/Monitor уже в production.** `regional-watch-editor` version `caf89c4f-acbd-46c9-ab75-6998a8a9d689` (`*/5`, AI/CORE_DB/NEWS_DB) и `regional-osint-monitor` version `8f6128e4-07ff-4464-b0d2-d0e7095ab8b9` (`*/1`, DB/REGION + четыре secret bindings). Old restore IDs: Editor `ee79d24d-45d3-4170-85d7-1de7f7c74a7c`, Monitor `d68c6b6a-137d-4f8b-af41-a1849bdd52c6`. D1 canary manual runs 6/6 Monitor sources accepted.
- [x] **GLOBAL-07. Reader cutover.** Monitor `COLLECTOR_CACHE_SOURCES=gdelt,centcom,marad,copernicus,satellite,unosat`; Editor `REGIONAL_EDITOR_CACHE_SOURCES=analysts,news_translation`. Private D1 reading + GitHub fallback in code. Не запрашивать Neon на посетителя.
- [x] **GLOBAL-08. Автоматические JSON-коммиты сборщиков прекращены.** Все восемь **реальных main-run** после PR #28 подтвердили: source Neon→D1 sync `success`, шаг GitHub JSON commit `skipped`. [Analysts](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43746934552), [CENTCOM](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43746934593), [Copernicus](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43746934582), [GDELT](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43746934609), [MARAD](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43746934548), [NASA](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43746934631), [UNOSAT](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43746934605), [переводы](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43746934572). При отказе Neon/D1 сохранён **условный fallback** на GitHub с visible workflow failure; аварийный сценарий проверен тестами, не навязывался production.
- [ ] **DEV-01. Единая система релизов (следующий архитектурный блок после команды пользователя).** A-03 / H-01: единый release manifest для Pages, Editor, Monitor и миграций D1; воспроизводимые bundle builds из одного SHA, последовательные gates, согласованные версии, раздельные permissions, контролируемая публикация и rollback. **Сейчас это НЕ завершено** — успешная ручная Cloudflare-публикация не заменяет полноценный CI/CD.
- [ ] **DEV-02. Release contracts и сокращение ручных операций.** A-02 / A-04: свести контроль конфигураций, связей Pages→Workers, routes, bindings, secrets, migrations, схем API и версий; исключить устаревшие промежуточные workflow и небезопасные shared-D1 preview-записи.
- [ ] **DEV-03. Надёжность storage/source-интеграций.** D-07: измерение Neon Free / D1 / Cloudflare Workers / GitHub Actions, retention, last-good snapshots, автоматическое и понятное различение partial / stale / unavailable и восстановление после сбоев; без платных сервисов.
- [ ] **DEV-04. Последующая модульная оптимизация по конкретным узким местам.** Устранение подтверждённого дублирования, лишних сетевых обращений и временных обходов, без преждевременного переписывания рабочих модулей.
- [ ] **QA-OUTSIDE-DEV. Сквозной QA сайта, UI, новостей и переводов.** Отдельный QA-процесс/чат, **не следующий блок этого разработчика**. Дефекты, найденные QA, становятся входящими задачами на исправление кода, но этот чат сам не запускает и не возглавляет глобальный QA.

**БЛОК ПРИЯТ И ЗАКРЫТ (15.11.2026):** PR #28/#29 merged, main CI green, все 8 collector source workflows на main успешно прошли с `git commit`/writeback `skipped`, отдельный Neon-primary 8/8 release run green. Следующее действие — **только отдельная команда пользователя на DEV-01 (единая архитектура сборки и релизов)**; QA сайта проводится отдельно. Унаследованный [PR #27](https://github.com/ArrakturIL/regional-osint-feeds/pull/27) закрыт как superseded без merge.

**Восстановление:** [main checkpoint](https://github.com/ArrakturIL/regional-osint-feeds/blob/main/docs/REGIONAL_WATCH_EXECUTION_CHECKPOINT_2026-11-15.md), PR #28, PR #29, actual GitHub Actions, Cloudflare D1/Workers. Три P1 новости остаются в отдельной редакторской очереди; не трогать в текущем блоке.

---

## 0. Главные решения и оговорки

1. Архитектура — модульный монорепозиторий `ArrakturIL/regional-osint-feeds`, Cloudflare Pages/Workers/D1, GitHub Actions, Neon Free как хранилище снимков сборщиков. **GitHub оставляем для кода, версионированных конфигураций и контрольных артефактов; высокочастотные JSON-коммиты после подтверждённой миграции постепенно исключаем.** Не переключать все источники разом.
2. **Уже существующий Cloudflare AI сохраняется.** Искать в первую очередь бесплатные *библиотеки и методы в дополнение к нему*: очистка/извлечение, словари, определения языка, проверки переводов, нормализация сущностей, дедупликация, lineage. Не подменять задачу установкой альтернативных больших LLM и переводческих серверов.
3. Область проекта — **и новости, и сырые OSINT-данные** (RSS, API, ADS-B/AIS, спутники, официальные документы, PDF, медиа, видео и т. д.); хранить время, источник, язык оригинала, исходную формулировку, источник утверждения, доступность, качество и степень независимости сообщений. Не превращать сообщения СМИ в «подтверждённый факт» автоматически.
4. Никаких новых платных сервисов, обязательного VPS/GPU, включения R2 или действий с секретами в публичных файлах; бесплатность лицензии не доказывает бесплатность размещения. Прежде чем обещать уложиться в квоты, измерить реальное потребление Neon, GitHub Actions, Workers, AI и D1.
5. Production и shared D1 не использовать как стенд для тестовых записей. В preview — только безопасные read-only проверки, пока нет отдельной изоляции. Не выдавать исторические QA-данные за состояние прямо сейчас.
6. Новое решение о Neon уже реализовано частично и **переопределяет старую заметку «отложить выбор хранилища»**. Старый `REGIONAL_WATCH_STORAGE_BACKLOG_2026-11-15.md` сохранён как историческое решение, не активный запрет на текущую feature-ветку. Прежний модульный рефакторинг уже объединялся в main; не запускать его заново.

## 1. Фактический baseline (подтверждения и ограничения)

**GitHub, прочитано 15.11:** `main` и `feature/integrated-data-quality-neon-20261115` **разошлись**. Сравнение: feature на **78 коммитов впереди**, но на **10 позади** `main`; HEAD `main` при сравнении `8eb9d6a198456130979ae24fffa3fbb1fb1118dc`. Состояние веток нужно пересчитать непосредственно перед интеграцией. **Нельзя сливать без разрешения конфликтов и полного CI.**

**Production:** опубликован модульный базовый сайт (в QA от 15.11: Pages `86cd2f80`, Editor `ee79d24d`, Monitor `d68c6b6a`), но **функциональные Neon/D1-кэш, новые исправления переводов/сортировки/интерфейса из feature-ветки не объявлять опубликованными**. Версии из QA — снимок, а не утверждение о текущем деплое.

**Neon:** проект `regional-watch-data`, БД `regional_watch`, восемь источников `analysts, centcom, copernicus, gdelt, marad, news_translation, satellite, unosat`. `NEON_DATABASE_URL` и отдельный `CLOUDFLARE_D1_API_TOKEN` были подтверждены **через GitHub Actions без раскрытия значений**. Восемь контрольных снимков записаны/прочитаны из Neon и синхронизированы в private D1 кэш. Один **реальный** GDELT-сбор записан в Neon и D1 без git push (13:39 UTC 15.11, `state=partial`, 5/8 пакетов); это доказательство канала, **не готовности восьми регулярных сборщиков**.

**Код подготовки:** на feature-ветке есть `scripts/neon_mirror.py`, `scripts/publish_neon_mirror.py`, `scripts/neon_to_d1.py`, схемы Neon/D1, валидаторы, адаптеры кэша Monitor для шести источников и Editor для двух. Gated read flags и legacy Git fallback присутствуют. Регулярная схема в `main`, production Worker read cutover и отключение старых JSON-коммитов **не завершены**. `REGIONAL_NEON_PRIMARY_SOURCES` не активировать до подтверждённого чтения и отката.

**Доказательства:** [Actions: секрет/доступ D1](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43719157091), [семь дополнительных источников в D1](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43719906721), [свежий GDELT](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43720072599), [конечный storage gate](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43720634079), [прогон полного приложения](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43719783483). Все эти прогоны относятся к указанным проверкам, а не к финальной эксплуатации.

**Последний QA, 15.11:** найдено несколько P1 смысловых ошибок перевода и P2 проблем группировки, свежести, локализации и UI. Часть прежних замечаний закрыта в опубликованной модульной базе (в частности, верхнее положение редакционной реплики и графическая полоска Polymarket); повторно их не переделывать без новой регрессии.

### Последняя проверенная реализация — 15 ноября 2026 (текущая сессия)

**Рабочая ветка:** `work/regional-watch-execution-20261115` и [черновой PR #25](https://github.com/ArrakturIL/regional-osint-feeds/pull/25) в `feature/integrated-data-quality-neon-20261115`. Дальше `main` ничего не сливалось; production, D1 и Neon не изменялись.

- **A-02 частично:** через GitHub подтверждено расхождение интеграционной ветки с `main`; read-only Cloudflare подтверждает production Pages `86cd2f80`, Editor `ee79d24d`, Monitor `d68c6b6a`. Полная API/cron/bindings-инвентаризация и пересчёт перед merge ещё предстоят.
- **A-03 частично:** подготовлен [release manifest](https://github.com/ArrakturIL/regional-osint-feeds/blob/work/regional-watch-execution-20261115/docs/REGIONAL_WATCH_RELEASE_MANIFEST_2026-11-15.md) с версиями, нерешёнными release-блокерами, флагами и откатом. Финальный release SHA не установлен — выпуск не разрешён.
- **B-01/B-02 частично:** source-backed D1 SELECT подтвердил, что в production остаются три P1 ошибки: танкеры/мины, Reuters `may hold off`, и подмена участника в JPost HE. В feature-коде усилена защита на точных RU/HE и Python формах. *Это не исправление опубликованных cached translations*. 
- **Проверки:** сначала RED на реальных фразах; затем [основной CI 43724245898](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43724245898) — 10/10 проверок прошли, deployment jobs пропущены; [Python translation CI 43724245865](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43724245865) — successful, production side effects на PR пропущены.
- **Восстановление после разрыва:** [чекпоинт текущей сессии](https://github.com/ArrakturIL/regional-osint-feeds/blob/work/regional-watch-execution-20261115/docs/REGIONAL_WATCH_EXECUTION_CHECKPOINT_2026-11-15.md). После ошибки сначала читать коммиты и этот документ, не повторять уже выполненный код и не заявлять о публикации.

- **D-03/D-04 (read-only аудит):** все восемь записей D1 проверены полным SHA-256 содержимого и timestamp, 8/8 успешно; при сравнении с текущими GitHub main snapshots **6 D1 источников отстают на 8–16 часов, GDELT в D1 на 3,87 ч новее (разовый подтверждённый прогон), satellite совпадает, но старше 72 ч**. Критерий регулярной синхронизации НЕ выполнен. [Подробный аудит](https://github.com/ArrakturIL/regional-osint-feeds/blob/work/regional-watch-execution-20261115/docs/qa/REGIONAL_WATCH_D1_SHADOW_AUDIT_2026-11-15.md).
- **D-04 инструмент контроля:** добавлены `scripts/audit_collector_cache.py` (только SELECT, без секретов в выводе) и восемь регрессионных тестов `scripts/test_audit_collector_cache.py`; [общий GitHub CI 43724933138](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43724933138): editor + все 10 проверочных jobs зелёные, релизные jobs SKIPPED. Результат `parity` нельзя объявлять, пока подтверждён дрейф шести источников.

- **B-01/B-02 подготовка исправлений (без публикации):** опубликованные первичные материалы INN, Reuters/JPost и JPost проверены; сохранён [review-only набор трёх RU/HE кандидатов](https://github.com/ArrakturIL/regional-osint-feeds/blob/work/regional-watch-execution-20261115/data/qa/p1-translation-remediation-20261115.json), включая точные повреждённые поля. Найдена и исправлена дополнительная ошибка JS \\b для ивритского `מכרה` — бывший повреждённый HE summary теперь отклоняется. [Обратимый порядок исправления и QA](https://github.com/ArrakturIL/regional-osint-feeds/blob/work/regional-watch-execution-20261115/docs/qa/REGIONAL_WATCH_P1_TRANSLATION_REMEDIATION_2026-11-15.md); CI [43725555347](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43725555347) GREEN 10/10. **В D1 ничего не меняли; P1 не закрыт**.

Следующие незакрытые блокеры: проверенные корректировки существующих P1 записей с возможностью отката; D-04/D-05 реальные теневые циклы и read parity; RU/HE preview QA; согласование веток перед любым релизом.

## 2. Очередь работ: одна матрица, с приоритетами и зависимостями

Легенда: `[x]` подтверждён отдельным результатом/коммитом/CI; `[~]` реализовано или проверено частично, но ещё не принято; `[ ]` не выполнено/нет достаточного подтверждения. **Это не список поручений на немедленное изменение production.**

### A. Стабильность ветки, контрактов и выпускного процесса (P0/P1, прежде релиза)

- [x] **A-01.** Основная модульная архитектура развернута до нового интегрированного проекта; не повторять дробление старых монолитов и восстановление восьми HTML-маршрутов. История: QA 15.11, PR #23, baseline `83bf314`.
- [ ] **A-02.** На начале следующей разработки зафиксировать актуальные SHA feature/main, Pages/Editor/Monitor versions, конфигурации cron/bindings и полный набор публичных API/флагов. Реконсилировать 78 ahead / 10 behind без потери регулярных коммитов `main` и без принудительного push; проверить, какие diff относятся только к данным.
- [ ] **A-03.** Подготовить единый release manifest: исходный commit, сборка Pages, bundle Monitor, bundle Editor, D1 schema migrations, workflow flags, ссылки на CI/preview, схема отката. Не смешивать «green Pages» с автоматическим релизом Editor/Monitor.
- [ ] **A-04.** Гейт выполнения: tests → раздельные read-only интеграционные проверки → доступный preview RU/HE → QA → разрешённый поэтапный выпуск → production smoke. Защита всех общих D1 bindings, отсутствие секретов в артефактах и API.

### B. Критическая достоверность переводов и атрибуции (P1 — раньше расширения источников)

- [~] **B-01.** Детальные проверки фактов в feature-коде есть, но проверить на настоящем API/записях и исправить устаревшие кеши после безопасного snapshot: `67d535234b8e4179f9401a71` (морская мина превратилась в «танкеры атакуют»), `da4c4535478a60f9b3975e40` (Reuters: модальность, актор и условие `barring provocations`), JPost `article-914880` (HE подменяет действующего участника). **Принятие:** RU/HE соответствуют исходнику, источник сообщения явно указан; сбой ведёт к `needs_review`, а не `available`.
- [~] **B-02.** Продолжить тестирование перед публикацией и после перевода на subject/action/target, отрицание, возможность/условность, названия, даты/числа, «strike» в военном контексте vs «забастовка», термины `mine` (морская мина vs шахта), смешанные языки, ссылки и quoted claims. Есть код safeguards и тесты; покрытие реальных источников **ещё не принято**. Не доверять `self-confidence` модели.
- [ ] **B-03.** Сохранить `original_language`, `source_hash`, оригинальный title/summary, translated fields и field-level status в D1/API. Исправить ложную маркировку русского перевода англоязычного первоисточника как `source/original`. Провести idempotent refresh только для действительно изменившихся текстов.
- [ ] **B-04.** Редакционные заметки: HE может иметь готовые `headline/text`, но общий `pending` из-за не локализованного `verified_note`; проверка completeness должна быть по полям. Аналогично официальные публикации ЦАХАЛ — различать готовый RU, ожидающий HE, clean HTML и достоверность перевода.
- [ ] **B-05.** «Реплика редактора»/досье о военных ударах — нейтральный, не насмешливый комментарий к возможным жертвам и не смешивающий факты. Проверить исторические записи; не ломать уже исправленное сообщение Сирик/Дидамар и футбольную историю, по QA 15.11 они прошли регрессию.

### C. Реальная новостная лента, группировка и происхождение (P1/P2)

- [~] **C-01.** Feature реализует claim-identity и `sort=priority`/хронологический latest; **принятие на живом приложении отсутствует**. Архив «Последние публикации» — от новых к старым; приоритетный режим отдельно обозначен; на главной срочные/важные сообщения не должны бессрочно вытеснять свежие. RU/HE ID и порядок одинаковы.
- [~] **C-02.** Пять публикаций об одном эпизоде/цели объединяются в одну читательскую историю, **не теряя** ссылки всех издателей, различия в подтверждении гибели и сомнения. Отличать один эпизод от двух ударов по той же цели, отделять смешанные дайджесты от одиночных событий. Не считать перепечатку агентства независимым источником. Прогон на реальной выборке обязателен.
- [ ] **C-03.** Досье/плашка уровня «сообщения источников»: явно объяснять для **каждого существенного утверждения** что именно известно, по каким ссылкам, а что не подтверждено. Универсальная плашка «не является независимым подтверждением» без содержательного пояснения — недостаточна. Случай Гофмана и аналогичные карточки, не только одна.
- [ ] **C-04.** «Что изменилось» и «Что остаётся неясным»: отображать конкретную подтверждаемую дельту и конкретные неизвестные, а не абстрактное предупреждение/пустоту. При отсутствии сравнимых источников не утверждать, что ничего не произошло. `generatedAt`, начало периода, freshness, count independent origin и статусы должны быть явными.
- [ ] **C-05.** Предусмотреть раздельные `event_at / published_at / collected_at / first_seen` и source-owner/origin lineage. Исключить историческую новость, поданную как текущая; перепроверить неверный тип события у новостных дайджестов.

### D. Neon → private D1 → Workers: безопасная миграция восьми сборщиков (P1/P2)

- [x] **D-01.** Neon Free, схема snapshots, проверки SHA/timestamp/атомарности/коллизий; интеграционные тесты private write/read выполнены; обе нужные Actions secrets подтверждены без раскрытия.
- [x] **D-02.** Проверены восемь пар `data/status`, backfill D1 и реальный новый GDELT цикл без GitHub writeback. `partial` отражает 3 недоступных пакета, не выдаётся за полный охват.
- [x] **D-03.** Адаптеры Monitor/Editor опубликованы с D1-флагами, проверкой SHA-256, freshness и GitHub fallback. Основные source tests прошли. Дополнительная браузерная регрессия — в следующем блоке GLOBAL-09.
- [x] **D-04.** Запущено расписание Neon-primary→D1 reconciliation без GitHub JSON; реальный production [run #43748774226](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43748774226) завершён 8/8, 54 unit tests green. 8/8 SHA readback Neon/D1 совпал.
- [x] **D-05.** Monitor читает 6 источников из private D1, Editor — 2; тестовые canary-запуски Monitor подтверждают корректные состояния `ok` / `partial` без ошибок и без секретов в публичном ответе. Переводы и UI — отдельный QA блок.
- [x] **D-06.** Восемь real `main` workflows PR #28 подтвердили source D1 sync `success` и legacy `git push`/`commit` `skipped`. Ссылки на все восемь запусков — в GLOBAL-08. В аварии conditional fallback GitHub сохраняется (проверен кодом/тестами, не воспроизведён в production).
- [ ] **D-07.** Контроль расхода Neon Free/GitHub Actions/D1, retention и восстановление последней хорошей версии. Журналы и алерты `data fresh / collector partial / sync failed / reader fallback`, без ложных `ok`.

### E. Непотерянные QA-дефекты API, источников и аналитиков (P2)

- [ ] **E-01.** Очередь аналитиков: возраст самого старого `pending`, `needs_data`, пропуск пригодных публикаций при partial mirror, публикация в рамках бюджета, обработка ошибок по источнику, retries/backoff, отсутствие повторной публикации. Числа `68 pending`, `12 needs_data`, `13 published` в старом QA — **снимок 15.11 04:30, не свежий счётчик**.
- [ ] **E-02.** DVIDS/CENTCOM и Israel Hayom 403: корректно разделять ошибку сбора, задержку `heartbeat`, дату первоисточника, отсутствие разрешённого feed и реальную пустоту. Не обходить ToS. GDELT и Copernicus в partial/error показывать полноту покрытия, а не `ok`.
- [ ] **E-03.** Smoke `scripts/test_live_regional_watch.py`: убрать устаревший `/api/he/news` или восстановить официально обещанный alias, канонический путь `/api/news?lang=he`; защитить API и RU/HE паритет тестом. В feature исправления скрипта есть, но требуются зелёный CI/реальный live smoke и контракт.
- [ ] **E-04.** Новые источники СМИ — вести separate candidate registry: разнообразие владельцев/редакций, source provenance, правовые RSS/API условия. Экспериментальные shadow-коллекторы и фильтр от 12.11 уже есть; не подключать новый набор к production до качества текущего.
- [ ] **E-05.** Для Polymarket различать YES market price vs вероятность реального события, закрытые/просроченные рынки, `asOf` и статус; HE/RU локализация и fallback при отсутствии перевода.

### F. UI и полноценная приёмка пользователя (P2/P3)

- [x] **F-01.** Редакционная реплика уже наверху главной; графическая полоска YES для Polymarket восстановлена. Охранять регрессиями, **не переделывать повторно** без нового дефекта.
- [~] **F-02.** В feature-коде подготовлены компактный Digest, CSS-порядок колонок, склонение RU, HE aria кнопки наверх, без лишнего архива polling. Нужен реальный проверочный прогон в preview, включая раскрытые очень высокие карточки и пустоты между ними.
- [ ] **F-03.** Навигация: `/events#all-news`, `?story=...`, аналитики deep links, возврат, RU↔HE, скролл/focus/ARIA, на прямом URL и при задержке API. Проверить 390, 719, 1363 px, мобильный touch и клавиатуру. То, что один путь работал в QA, не закрывает все варианты.
- [ ] **F-04.** Отдельные loading/empty/error/partial/ready, искусственный 503, broken JSON, recovery Retry, смена языков без подмены контента, автоматическое появление готового HE перевода в открытой странице. Работа одного API не должна скрывать ошибку другого.
- [ ] **F-05.** Визуальное/текстовое качество досье и редакции: понятный дисклеймер, компактное объединение «Что изменилось / Последняя проверка», границы разделов, RU склонение, HE переводы меток, даты, карточки на desktop/mobile.
- [ ] **F-06.** Измерить холодный/repeat мобильный TTFB, LCP, число запросов и размер ресурсов; проверить оставшиеся Pages→Workers proxies, cache language segregation и отсутствие дублирующих вызовов.

### G. Большое OSS-исследование: каталог сохранён, внедрение — по измеренной пользе (P2/P3)

**Важно: исследование уже проведено.** Большой документ `Regional Watch: бесплатный и open-source стек для мониторинга, OSINT, анализа сырой информации, переводов и проверки достоверности` хранится в Library. Его рекомендации — **кандидаты**, не автоматически принятые компоненты. У исходного обзора есть концепция тяжёлого self-hosted стека, которая **не согласуется с выбранной бесплатной serverless-архитектурой**; это исследовательский вариант, а не требование переписать Regional Watch.

- [x] **G-00.** Найдены исходное большое OSS-исследование и уточняющий контекст `REGIONAL_WATCH_RESEARCH_CONTEXT_2026-11-15.md`. Отдельный запрос пользователя: усиливать **текущий** Cloudflare AI готовым ПО и проверками, охватывать новости **и сырой OSINT**, не строить без согласия другой AI-инфраструктуры.
- [ ] **G-01. Инвентаризация без дублей.** До установки npm/py-пакета сравнить с уже существующими функциями Worker/Editor, `scripts/news_event_filter.py`, source normalizers, `translations/fact-guard.mjs`, `scripts/translation_semantics.py`, `analysts/translation.mjs`, тестами и CI. Для каждого кандидата: нужный дефект, ожидаемая экономия/точность, лицензия, maintenance, размер, совместимость Workers/GitHub Actions, измеренный результат, итог `adopt / keep native / backlog / reject`.
- [ ] **G-02. Дешёвые встроенные инструменты — первыми.** `Intl.Segmenter`, Unicode normalization, regexp, built-in hashing, JSON Schema-валидация/типы, существующий content-hash кэш, правила чисел/дат/отрицаний, терминологические словари EN/RU/HE/AR, нормализованные canonical URLs. Измерить precision/recall на конкретных ошибках новостей/OSINT перед добавлением зависимостей.
- [ ] **G-03. Маленькие библиотеки — провести короткие A/B trials.** `fast-xml-parser` (RSS/Atom/XML и namespaces), `Cheerio` + `@mozilla/readability` (обоснованное извлечение HTML/статей), `franc-min` (только после проверки коротких/mixed HE/AR фрагментов), `transliteration` (только осторожно; не заменяет имена/топонимы иврит/арабский), лёгкие fuzzy/similarity алгоритмы для candidate dedup. Не внедрять сразу весь набор: один пакет = один замер + тест + ясное преимущество.
- [ ] **G-04. Translation QA рядом с Cloudflare AI.** Матрица term dictionary, original↔translated entity matching, conditional/negation/modality guard, фрагментная проверка совпадений, cache SHA и статус review; проверить на 20+ примерах на RU/HE/EN/AR (включая тройку P1 из B-01). Не делать новую модель обязательной частью выпуска.
- [ ] **G-05. Raw OSINT adapters.** Взять по одному реальному JSON/CSV, RSS/XML, HTML, документу/PDF, AIS/ADS-B и спутниковому GeoJSON примеру. Без агрессивного scraping и нарушения лицензий: набор контрольных исходников, schema/status/freshness validation, file hashing, source attribution. `PapaParse`, `pdf.js`, `Mammoth` и подобные — **условные** кандидаты при реальных данных, не обязательные пакеты по умолчанию.
- [ ] **G-06. Медиа/архив/география — отдельно, только по потребности.** Кандидаты `ExifTool`, `FFmpeg`, `yt-dlp`, `Bellingcat Auto Archiver`, `MapLibre`, `Turf.js`, OSINT reference datasets, Wayback/CDX и ClaimReview. Проверять ToS, размер, GitHub Actions runtime и права на содержание; для фото/видео осмысленнее ограниченный offline worker, чем обработка в 10ms Workers. Не выдавать совпадение хэша/кадра за верифицированную геолокацию.
- [ ] **G-07. Полезные существующие внешние данные.** GDELT Mentions и Media Cloud рассматривать как **дополнительные сигналы** о происхождении, цитировании и повторах; Google Fact Check Tools — только lookup с проверенным доступом/квотой. Open-source данные ≠ независимое подтверждение заявления. Обновление авиационного AirLabs (1000 запросов/мес по сообщению пользователя) — отдельный candidate/лимит, не бесконечный feeder; не включать пока автоматически.
- [ ] **G-08. Heavy stack оставлен в reference backlog, НЕ для текущего релиза.** `Crawlee+Playwright` для масштабного браузерного сбора, `changedetection.io`, `RSSHub`, `Apache Tika`, `Unstructured`, `Qdrant`, `OpenSearch`, `Meilisearch`, `Temporal`, `BullMQ+Redis`, `OpenAleph`, графовые серверы, `Ollama/llama.cpp`, `Marian/OPUS-MT`, `CTranslate2`, `MADLAD`, `Tesseract/Whisper` — могут быть OSS, но требуют отдельного хостинга, CPU/GPU/RAM/очередей или юридической проверки. Сейчас не вводить их как инфраструктурную зависимость; допустим узкий ограниченный GitHub Actions experiment при доказанной необходимости.
- [ ] **G-09. Лицензионная и maintenance-проверка.** В старом каталоге упоминались лицензии, которые требуют осторожности: NLLB/Seamless non-commercial checkpoints, RSSHub/FreshRSS AGPL, n8n Sustainable Use (не классический OSI OSS), архивированный GramJS/переход на teleproto, ограничения публичных поисковых APIs, terms Facebook/X/YouTube и документов. Перед реальным выбором проверить upstream и ограничения конкретной версии, а не полагаться на слова старого обзора.
- [ ] **G-10. Итог OSS-trial.** Таблица **минимум**: кандидат → сейчас уже реализовано? → задача/проверка → качество до/после → время/квоты/байты → поддержка RU/HE/EN/AR → лицензия и ToS → решение. Новые зависимости допускаются только если выигрыш подтверждён и не требует нового платного runtime. Каталог не выкидывать и не делать основным TODO.

### H. Финальная интеграция, релиз и регрессионный QA (P0/P1)

- [ ] **H-01.** Объединить A–G в один управляемый release candidate; построить из одной версии Pages, Editor, Monitor. Проверить CORS, routes, JSON schemas, D1 migration idempotency, feature flags, no secret exposure, корректный доступ к сервисам и quota monitoring.
- [ ] **H-02.** Набор контрольных RU/HE кейсов и API: `news` страницы offset 0/40/80/…, `stories`, `editorial-notes`, `analyst-posts`, `data`, `overview`, `official-posts`, рынки, авиация, спутники, противоречащие и повторные источники. На same IDs проверить субъект/даты/ссылки/status и локализации. Browser QA first-visitor + desktop/mobile + 429/503 + timeout и last-good.
- [ ] **H-03.** Сопоставить фактическое состояние всех пунктов QA 13.11, QA Frontend 15.11, QA Backend 15.11. Для каждого: `closed verified / partial / open / not tested` с доказательством `commit + run + deployment + воспроизведение`. Не закрывать по факту наличия кода.
- [ ] **H-04.** Только после явно разрешённого слияния и выпуска: production smoke, журналы двух Workers, D1 SELECT, несколько циклов Neon/D1, контроль источников, очистка ошибочных статусов; rollback на уровне **каждого** источника и всех трёх билдов. Реплику редактора и непрерывный мониторинг не ломать.

## 3. Что считаем уже закрытым или частично закрытым — не начинать заново

- Модульный baseline/переезд фронта + Editor + Monitor в понятные директории, единые RU/HE страницы и основные Pages routes — **подтверждено в объединённом main до интеграционной ветки**.
- Исправление конкретной записи Сирик/Хормозган, удаление опасного сарказма там, объединение двух публикаций о футболисте, RU/HE одинаковый состав 284 ID — **прошло QA 15.11 на его снимке; оставить регрессии**.
- Верхнее место редакционной реплики, шкала Polymarket YES, официальные публикации HE с честным pending — **исправлено/частично подтверждено старым QA; без повторной разработки, если новое тестирование не обнаружит регрессию**.
- Neon secrets, 8 snapshot records, приватный D1 backfill, одно свежее GDELT-зеркало, адаптеры двух Workers и safe rollback flags — **в feature-коде и/или подтверждённых CI, но ещё не полностью на production**.
- Большое OSS-исследование — **ГОТОВО КАК ИССЛЕДОВАНИЕ**; каталог не считается утверждённой или установленной системой.

## 4. Документы: единый индекс и правило актуальности

**Текущий TODO:** ЭТОТ документ. Работы и их приоритет меняются здесь, а не в семи разрозненных чекпоинтах. Все прошлые материалы сохранять, не удалять как «лишний мусор».

**Источник технического плана/спецификации (GitHub feature):**
- [Integrated Neon+QA checkpoint, включая последние результаты](https://github.com/ArrakturIL/regional-osint-feeds/blob/feature/integrated-data-quality-neon-20261115/docs/REGIONAL_WATCH_CHECKPOINT_2026-11-15_INTEGRATED_NEON.md) — читать **снизу вверх/последние разделы имеют приоритет**; в начале файла есть устаревшее утверждение, что секретов нет.
- [Integrated architecture design](https://github.com/ArrakturIL/regional-osint-feeds/blob/feature/integrated-data-quality-neon-20261115/docs/superpowers/specs/2026-11-15-regional-watch-integrated-architecture-design.md) — действующее техническое решение (не факт релиза).
- [Execution plan 15.11](https://github.com/ArrakturIL/regional-osint-feeds/blob/feature/integrated-data-quality-neon-20261115/docs/superpowers/plans/2026-11-15-regional-watch-neon-quality.md) — исторические unchecked строки **не перезапускают** уже выполненные миграции.
- [Neon→D1 runbook и условия поэтапного rollout](https://github.com/ArrakturIL/regional-osint-feeds/blob/feature/integrated-data-quality-neon-20261115/docs/architecture/neon-d1-sync-runbook.md) — точная последовательность флагов и отката.

**Библиотека — исследование / QA / история:**
- `Regional Watch: бесплатный и open-source стек для мониторинга, OSINT, анализа сырой информации, переводов и проверки достоверности` — **большой каталог идей**, не текущая целевая архитектура.
- `REGIONAL_WATCH_RESEARCH_CONTEXT_2026-11-15.md` — **обязательное уточнение**: не менять Cloudflare AI, искать дополнительные инструменты, учитывать сырые OSINT и реальные бесплатные лимиты.
- `Regional-Watch-QA-Frontend-86cd2f80.md`, `Regional-Watch-QA-Backend-86cd2f80.md`, `Regional-Watch-QA-Plan.md` — последние подробные QA-доказательства по опубликованной модульной базе.
- `Regional-Watch-QA-Action-Plan-2026-11-13.md`, `Regional-Watch-QA-Execution-Status-2026-11-14.md` — старые дефекты и история, проверять только ещё не закрытые.
- `REGIONAL_WATCH_CHECKPOINT_2026-11-14_CONNECTION_LOST.md` и `REGIONAL_WATCH_CHECKPOINT_2026-11-15_CONTINUATION.md` — история modularization, **не текущий стоп-поинт Neon**.
- `REGIONAL_WATCH_STORAGE_BACKLOG_2026-11-15.md` (main) — старый выбор до Neon; не трактовать как запрет позже согласованной feature-разработки.

## 5. Следующий архитектурный блок — только по новой команде

**DEV-01: единая управляемая сборка и публикация Pages + Editor + Monitor** (A-03, H-01). Строить из одного исходного commit SHA, корректно обеспечивать GitHub Actions → Cloudflare Workers права вместо ручного плагинного обхода, проверять контракт bindings/routes/cron/migrations, публиковать поэтапно и иметь автоматизируемый точечный rollback. Сначала код и CI на отдельной ветке, затем подтверждение реального релиза и обновление TODO. **QA всего сайта, контента, переводов и UI не входит в этот блок.**

Далее — DEV-02 и DEV-03, только после отдельного отчёта по завершённому DEV-01 и новой команды пользователя.

**Правило статуса:** каждому завершённому инженерному блоку — тесты, релизные доказательства, обновление этого TODO, короткий отчёт, остановка.
