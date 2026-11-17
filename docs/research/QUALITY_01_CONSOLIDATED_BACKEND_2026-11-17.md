# QUALITY-01 — единый backend пакет без production-выпуска

**17 ноября 2026. [PR #85](https://github.com/ArrakturIL/regional-osint-feeds/pull/85) — готов к review, ещё не merged / not deployed.**

## Тестовый результат

[Полный application CI #44011838779](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/44011838779) — **SUCCESS**: 11 фактически запущенных jobs (Editor, Monitor, все Pages и frontend source, immutable release), Preview и Production оба **SKIPPED**. Полная immutable bundle **21 файл**; оба Worker Wrangler `--dry-run` SUCCESS. В PR тестируется GitHub synthetic merge SHA `d25e1ea59ed8db785840deb6f2993f8b48452f47`, а не опубликованный Cloudflare release. Важная граница: **CI ≠ production/live QA**.

Тесты раньше воспроизвели проблему хронологии/DTO (RED [#44011398064](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/44011398064): missing event provenance). Ранние прогоны также выявили неверные переносы в новом workflow и неполные новые mocks; все исправлены до успешного полного CI. E-06 assertion fail наблюдался в [#44011722137](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/44011722137), где masculine `официально установлен` ещё обходил guard; теперь покрыт. Не выдавать все случаи за полный отдельный RED→GREEN, если их негативный прогон не был независимо зафиксирован.

## Изменения

- **E-06 — исправлено на текущем Editor source:** Unicode-aware границы категоричных русских заголовков `подтвержден(о/а/ы)`, `доказан(о/а/ы)`, `официально установлен(о/а/ы)`, включая мужскую форму; явное `не подтверждено` / `не доказано` не блокируется. Подтверждено direct-test на `createAnalystDecision` и source-editor CI. Frozen Editor untouched: тестовая реконструкция прежнего Git blob нормализует только осознанное E-06 изменение, остальная структура обязана остаться byte parity.
- **C-01/C-05 — backend DTO:** новостной API явно сообщает `event_first_seen_ms`, `event_last_seen_ms`, `representative_published_ms`, `sort_basis`. Историческое поле `published_ms` и алгоритм сортировки без смены поведения; проверка locale-invariant `latest`/ `priority`, пагинации и first/last source times. Это устраняет неопределённость значения времени в API, **не закрывает** всю фронтенд-хронологию, старый баг склейки страниц остаётся F-07.
- **C-03 — дополнительная атрибуция:** `source_assertions` по первичным `sources_json` и `independent_verification:'not_established'`. Число издателей не признаёт заявление проверенным фактом. У UI/досье своя отдельная задача понятных плашек.
- **E-05 — данные Polymarket:** `YES` ищется по фактическому индексу `outcomes`, а не как первый ценовой элемент. Null/unknown outcomes, закрытые/неактивные markets отклоняются. Возвращаются `price_kind:'yes_token_price'`, `independent_probability:false`, caveat и asOf; прежний `yes` численный контракт сохранён. Карточку с некорректной UI-надписью «вероятность» исправлять отдельно на фронтенде.

## Граница и оставшиеся задачи

Изменения только в текущем коде API и guard, тестах, CI и документации. **Нет новых Worker, платных сервисов, миграций D1, Neon write, AI/cron/секретов, удаления legacy.** ARCH-04/05 владелец считает условно принятыми в рабочей очереди до выявления реальной регрессии; назначенные независимые приёмки остаются по графику.

**Не закрывать целиком B-02/B-03/B-04/B-05, C-01/C-02/C-03/C-04/C-05, E-01–E-05 либо GLOBAL QA без отдельной подтверждённой проверки соответствующих границ.** Следом остаются C-02/C-04, B-02–B-05, E-01–E-04 и F/H (после согласованного backend release).
