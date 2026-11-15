# REGIONAL WATCH — DEV-03: read-only аудит хранилищ, квот и восстановления (16.11.2026)

**Статус:** read-only измерения реальных Neon/D1/GitHub/Cloudflare и подготовленная **ещё не слитая** кодовая защита [PR #40](https://github.com/ArrakturIL/regional-osint-feeds/pull/40). Не путать с production-релизом или полноформатным QA. Публичные source/Worker endpoints, D1 данные, Neon, секреты и тарифы этим блоком не менялись.

## 1. Наблюдаемое состояние (не оценка по документам)

| Сервис | Измерение | Вывод / ограничение |
|---|---|---|
| Neon `regional-watch-data` (Free v3, Frankfurt) | **8** source snapshots; **6 `ok`, 2 `partial`, 0 `error`, 0 `stale`**. Таблица `regional_collector_snapshots`: **253 952 Б** (включая индексы). Проект сообщает `compute_time_seconds=2103`, `active_time_seconds=8340`, `data_transfer_bytes=5 213 545` за возвращённый сервисом период до 1 декабря. | Это usage counters из Neon API, **не** расчёт оплаченных CU-hours. Исторического архива версий источников в таблице нет: по одной актуальной строке на ключ. |
| Neon retention | В настройках проекта `history_retention_seconds=21600` = **6 часов**. `branch_logical_size_limit_bytes=1 073 741 824` = **1 GiB**. | Instant Restore до 6h — **не** длительное посуточное хранение last-good. Восстановление за 2 дня из Neon history не обещать. Бесплатный план на дату проверки: [1 GB/проект, 100 CU-hours/проект/мес](https://neon.com/blog/neon-free-plan-1-gb-per-project). |
| Cloudflare D1 | Рабочая `regional-osint` — **11 612 160 Б / 25 таблиц**; `regional-watch-news` — **6 254 592 Б / 15 таблиц**. Вместе **17 866 752 Б ≈17,9 MB**. В source-cache 8 строк, query `rows_read=8`, `rows_written=0` на один read-only запрос. | Это **не** суммарное использование аккаунта и не дневной расход. По [официальной бесплатной квоте D1](https://developers.cloudflare.com/workers/platform/pricing/) — 5 GB на аккаунт, 5 млн rows read/день и 100 тыс. rows written/день. **Дневная фактическая аналитика read/write не получена**. |
| Worker cron | Live Editor `*/5 * * * *` и Monitor `*/1 * * * *`, по конфигурации это **288 + 1440 = 1728 плановых срабатываний/сутки**, если все выполняются. | Это **расчёт по расписанию**, НЕ измеренное число Worker requests/CPU/rows. По [Cloudflare Workers Free limits](https://developers.cloudflare.com/workers/platform/limits/), 100 000 requests/day и 10 ms CPU/invocation; реального дашборда CPU/дневной нагрузки не извлекали. |
| GitHub Actions | **433 запуска за 15.11.2026** по GitHub API; ~156 минут суммарной разницы между временем запуска и обновления по этим записям (не реальные billed runner minutes). Из них 186 `Regional Watch application source checks`, 69 failures (включая ожидаемые RED тесты в процессе разработки). | Репозиторий публичный, standard `ubuntu-latest` runner: **бесплатный и не уменьшает платную месячную квоту** ([GitHub Billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)). Хранилище Actions artifacts/caches и реальные billed-minute метрики отдельно не замерялись; не выдавать wall-time за счёт. |

### Разбивка живых Neon source statuses

| Источник | stored `checked_at` UTC (снимок) | Статус |
|---|---|---|
| analysts | 2026-11-15 18:59:52 | ok |
| centcom | 2026-11-15 18:48:15.606 | ok |
| copernicus | 2026-11-15 18:49:02.273 | partial |
| gdelt | 2026-11-15 18:28:29 | ok |
| marad | 2026-11-15 08:09:29.228 | ok |
| news_translation | 2026-11-15 21:04:48.867 | ok |
| satellite | 2026-11-15 17:39:04.717 | partial |
| unosat | 2026-11-15 18:52:22.644 | ok |

**Диагностическая проблема подтверждена:** `marad` сохраняет `ok`, хотя последний `checked_at` старее двух очередных шестичасовых циклов. `ok` нельзя приравнивать к свежести. `partial` Copernicus/Satellite — неполный охват, не статус «всё работает». Статусы относятся к моменту SQL-аудита; это не утверждение о сегодняшних событиях в мире или о текущем состоянии каждого внешнего feed.

## 2. Кодовая защита в draft PR #40 (не production)

`scripts/sync_neon_primary_to_d1.py` и `scripts/test_sync_neon_primary_to_d1.py`:

- Различать `data_fresh`, `collector_partial`, `data_stale`, `source_unavailable`, `replica_ahead` после верификации источника и D1. Порог возраста — по расписаниям источников с запасом на GitHub задержки: analysts/centcom 2h, GDELT 4h, Copernicus 16h, MARAD 13h, Satellite 36h, UNOSAT 28h, translation 6h.
- Источник с `error` или `stale` **не должен перезаписывать последний валидный D1 snapshot**. Перед `held_last_valid` проводится фактический SELECT из D1, проверка JSON/SHA-256/checked_at и допустимости статуса `ok`/`partial`. Если прошлой валидной строки нет — аварийный source/stage failure, **никакого ложного `ok` или `held`**.
- Отдельно сообщается **возраст удержанной D1-копии**, а не только возраст нового сбойного heartbeat. Разрешённый статус `partial` никогда не переименовывается в `data_fresh`.
- В существующем (уже плановом) двухчасовом `collector-shadow-sync.yml` ничего дополнительно не запускаем. Список по восьми источникам и warning-annotations выводится в log и `GITHUB_STEP_SUMMARY`; без DSN, ключей, текстов статей и raw payload.
- Читатели Monitor и Editor до этого уже имели проверяемый D1→GitHub fallback. В том же **draft PR #40** теперь добавлены metadata-only `reader_fallback` журналы: `cache_missing`, `cache_invalid`, `cache_stale`, `cache_unavailable`. Записи появляются только при включённом D1 source flag, с throttling **не чаще раза в час на источник/причину/Worker isolate**. Токены, URL, payload и исходный текст исключены; текущие DTO/порядок fallback не меняются. Есть RED→GREEN и отдельные тесты sanitization/throttle. **Это пока не запущено в production и не означает наличия централизованного постоянного счётчика reader fallback.**
- Неподтверждённое состояние D1 (нет строки/повреждена SHA) **не** объявляется last-good. Перезапись конфликтующего equal-time snapshot автоматически **не** выполняется — это отдельный recovery gate, а не разрешение скрывать потенциальную порчу.

**TDD:** [RED при отсутствии функции](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43766428166) → [GREEN после базового решения](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43766870782) (**11/11 checks**) → тесты фактической D1 checksum-last-good, ошибок/аннотаций и retained age; финальная проверка [CI #43767398292](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43767398292): **11 successful jobs, 0 failed; production и preview jobs skipped**.

**Дополнительное TDD для читательского fallback:** [RED #43767931791](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43767931791) (раньше не выдавался диагностический event), [GREEN #43768142036](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43768142036) — **11/11 successful jobs**, 0 failures, immutable three-component bundle build success, production и preview skipped; отдельная [offline architecture check #43768142022](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43768142022) также зелёная. Фактический live Worker log после релиза ещё **не** наблюдался.

## 3. Что ещё нельзя считать решённым

1. Долговременная **история здоровых снимков** и автоматическое восстановление на произвольную дату (более 6 часов в Neon) не организованы; в обеих текущих таблицах по одной версии на источник. Историческая GitHub JSON-копия заморожена, но не гарантирует текущий last-good после перевода на Neon.
2. При `partial` новый, неполный пакет по действующему контракту может заменить предыдущий `ok`; новое правило удержания защищает только новые `error`/`stale`. Это **не** полноценная архивная стратегия.
3. Самостоятельное восстановление **повреждённого** D1 с тем же timestamp требует отдельного безопасного CAS/rollback механизма. Сегодня корректнее завершиться ошибкой, чем затереть конфликтующие байты.
4. Точные счётчики дневного расхода D1 rows/Worker CPU и total artifacts не извлечены; без них нельзя утверждать «все лимиты гарантированно безопасны». Добавление платных ресурсов не допускается.
5. PR #40 ещё не объединён: изменения синхронизации и fallback-журналы будут действовать только после отдельного release gate и реального двухчасового синхронизационного цикла. Выпуск в main также запускает coordinated production release, поэтому до него нельзя говорить, что runtime защита работает.
6. Live веб-UI/RU-HE, семантика публикаций, полномасштабное QA и DEV-04 — отдельные блоки, в данном аудите не выполнялись.

## 4. Следующий gate до закрытия D-07

- Убедиться в code review PR #40, полном CI и реальном `main` release по согласованию с владельцем.
- На первом штатном scheduled sync проверить metadata-only `GITHUB_STEP_SUMMARY`, реальные D1 snapshots, `d1_verified` и состояния источников, включая `partial`; не тестировать за счёт ручной порчи production.
- Отдельным контролируемым шагом определить **исторический last-good retention** (существующие D1/Neon или безопасный Actions artifact) и **проверить в живых Worker logs**, что добавленные `reader_fallback` предупреждения не перегружают мониторинг. Не заявлять «всё восстановимо» до воспроизводимого теста восстановления.
- DEV-03/[D-07] оставлять **[~]** до этих ворот. Разработка другой очереди не начинается без команды.

**Статус:** аудит и тестовая реализация готовы; production защищён прежним кодом до согласованного выпуска новой ветки. 

---

## 5. Повторная проверка после восстановления соединения — более свежие факты (16.11.2026)

Предыдущие цифры в разделах 1–4 — **исторический read-only snapshot первой проверки**. Продолжение работы после кратковременного сетевого обрыва выполнялось по текущему состоянию GitHub, без повторного развёртывания или изменения Neon/D1.

**Свежие live read-only метрики:**

| Показатель | Повторная фактическая величина |
| --- | --- |
| Neon Free v3, Frankfurt | 8 источников: **5 `ok`, 3 `partial`**; partial = `copernicus`, `gdelt`, `satellite`; `marad` всё ещё `ok` со старым `checked_at=2026-11-15T08:09:29.228Z` |
| Neon API counters | `compute_time_seconds=2280`, `active_time_seconds=9040`, `data_transfer_bytes=5299277`; эти значения **не** счёт за CU-hours; retention 21600 секунд и проектный лимит 1GiB не изменились |
| Neon relation storage | `pg_total_relation_size('public.regional_collector_snapshots')=253952` байт, включая индекс |
| Core Cloudflare D1 | `regional-osint` **11677696 B**, 25 таблиц |
| News Cloudflare D1 | `regional-watch-news` **6258688 B**, 15 таблиц |
| GitHub Actions | **456 total workflow runs за 15.11 UTC** по read-only GitHub API, включая многочисленные тесты разработки; нельзя выдавать за месячные биллинговые минуты |
| Плановый Workers cron | 1440 Monitor + 288 Editor срабатываний в сутки по `*/1` и `*/5`; реальная CPU/requests статистика по-прежнему не измерена |

**Дополнительное воспроизведение дефекта и исправление.** Тест `test_future_dated_ok_snapshot_must_not_overwrite_verified_last_good` показал, что прошлая реализация копировала в D1 целостный по SHA `ok` snapshot с `checked_at` на 2 часа в будущем, хотя downstream классификация считала его `source_unavailable`. [RED run #43769512553](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43769512553) воспроизвёл нежелательную запись. В [code PR #40](https://github.com/ArrakturIL/regional-osint-feeds/pull/40) добавлено условие проверки **до write**, при отклонении более 20 минут сохраняется только действительно проверенный по SHA прошлый D1 snapshot; если его нет, синхронизация падает, а не выставляет ложный `ok`.

**Подтверждение текущего исходного кода:** PR #40 HEAD `b0fcaf9716da8aca0bb24e08216cbf82a2d2ad69`, **готов к ревью, не объединён**. [Полная проверка #43769577079](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43769577079): **11/11 checks successful, 0 failed**, immutable three-component release dry run успешен; Preview и production release jobs **skipped**. [Storage workflow #43769577085](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43769577085): проверка успешна, live Neon access job skipped. В production код DEV-03 не внедрён; реальный recovery и Reader fallback logs пока не подтверждены.

**Лимиты и методология:** официальные актуальные тарифные страницы [Neon Free (октябрь 2026)](https://neon.com/blog/neon-free-plan-1-gb-per-project), [Cloudflare D1 Pricing (октябрь 2026)](https://developers.cloudflare.com/d1/platform/pricing/), [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions). Free Neon: 100 CU-hours/project/month, 1 GB/project, 5 GB public transfer/month, instant restore 6h; Cloudflare D1 Free: 5GB total, 5M rows read/day, 100K rows write/day; публичные репозитории не тратят billable minutes на стандартные GitHub hosted runners, но расходы artifacts/cache требуют отдельного контроля. Эти значения — **общие тарифные лимиты**, не доказательство конкретного дневного фактического CPU или read/write расхода аккаунта.

**Незакрытая существенная граница:** две таблицы Neon/D1 содержат по одной версии на источник, и Neon instant history = 6 часов. Объективное восстановление ранее здорового пакета после полной потери D1 или надёжное историческое хранение на 7–30 дней пока **не реализовано**, поэтому DEV-03/D-07 остаются `[~]`. Сначала отдельная безопасная стратегия версионированного архива и восстановительный тест; никаких сюрпризных миграций, платного R2 или новых cron в данном PR.
