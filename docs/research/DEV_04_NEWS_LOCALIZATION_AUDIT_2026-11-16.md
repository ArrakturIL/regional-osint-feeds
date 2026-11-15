# DEV-04 — точечная оптимизация обработки новостных страниц (16.11.2026)

**Статус на этапе PR:** исправление и изолированные тесты готовы; опубликованный production подтверждается только отдельным coordinated release/postcheck после слияния.

## Подтверждённое узкое место

`backend/editor/src/news/api.mjs` до изменения выполнял три операции над **всем набором событий**, даже если пользователь запрашивал `limit=3` или `limit=4`: подготовка Hebrew native-source substitutions, `Promise.all(rows.map(localizeNewsRow))`, затем сортировка и `slice(offset,offset+limit)`. Для Hebrew `localizeNewsRow` без предзаполненного `he_hash` может делать отдельный приватный D1 SELECT по каждой записи; на растущем архиве это лишние запросы, задержка и расход Free лимитов.

### Измеренный RED → GREEN результат на фиксированных 32/20 событиях

| Проверка | До | После |
| --- | ---: | ---: |
| Пул 32 события; запрос he / priority / `offset=8&limit=4` — SELECT локализации | 32 | **4** |
| Пул 20 событий; запрос he / latest / `offset=6&limit=3` — IDs для альтернативных Hebrew оригиналов | 20 | **3** |

Сокращение локализационных запросов на первом тесте — **87,5%**; второго списка — **85%**. Это **числа из реальных Node тестов с имитацией D1**, а не измеренный Cloudflare CPU, не показание реальных production API и не гарантия кратного ускорения всех endpoint.

RED [Actions #43771373615](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43771373615) — именно корректные assertion failures `32 !== 4` и `20 !== 3`. GREEN [storage/news QA #43771451716](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43771451716) — оба регрессионных теста проходят, включая тесты Latest, Priority, soft publisher cap, RU/HE stable event IDs и hash. [Full app/release build #43771451700](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43771451700): **11 successful jobs, 0 failures**, production/preview skipped.

## Изменение

- Читаем все доступные eventRows как и прежде — это необходимо для `total_events`, полного стабильного feed_order_hash и корректного `offset`. Никаких скрытых первых-200 ограничений.
- Сортируем **сырые** события по строго тем же значениям (event_priority, last_seen_ms, event_id) и применяем ту же мягкую квоту publisher (priority >= 9 всегда сохраняется).
- Вычисляем hash по всему отсортированному набору, затем ограничиваем `offset, limit`.
- Только для выбранной страницы выполняем lookup native Hebrew originals, `localizeNewsRow`, атрибуцию и сборку DTO. `feed_rank`, `translation_summary`, `total_events`, `next_offset`, ссылка на оригинал, статус переводов и пара RU/HE не меняют контракт.
- Никаких зависимостей, платных сервисов, миграций схемы, новых задач или изменений Worker расписания.

## Границы и будущее

Остались full eventRows read и простой расчёт ordering по всем событиям — это необходимо для стабильной пагинации в существующей архитектуре. Тесты не доказывают реальную экономию D1 rows/CPU на production без vendor analytics; не заявлять замеренной экономии Cloudflare. Полный UI/E2E и QA переводов — отдельная очередь. OSS-кандидаты отложены по решению владельца.

**Критерий завершения:** утверждённое слияние, production release green, независимая Cloudflare проверка Pages/Editor/Monitor и обновлённый MASTER TODO; до этого статус DEV-04 не объявлять deployed.
