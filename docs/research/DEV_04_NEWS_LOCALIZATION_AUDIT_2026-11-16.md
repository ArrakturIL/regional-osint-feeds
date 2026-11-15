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


---

## Фактический production-релиз и проверка (16.11.2026)

Предшествующее «ещё не опубликовано» в отчёте — промежуточный статус, отменённый этим разделом.

- [PR #44](https://github.com/ArrakturIL/regional-osint-feeds/pull/44) объединён с `main`, commit `eba80a9c2bc9b2a6f9c5b70ff081fd2d68f74f2b`.
- [Coordinated release #43771725877](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43771725877): completed SUCCESS — **12 успешных заданий, 0 ошибок, 1 пропущенный Preview**, fallback rollback не применялся. Исходники трёх компонентов собирались и проверялись в релизном pipeline; D1 schema/bindings, version capture, RU/HE/API technical smoke и final receipt успешны.
- **Независимая Cloudflare API проверка после выпуска:** canonical Pages production `dc24c333-5f30-4ceb-a547-333fa50c85b9` success; Editor версия `6999890c-8d3b-45b3-a887-8c31bca7c4fc` 100%; Monitor версия `34b8e6b5-a51b-4bc1-bca5-6238c9dc7ebe` 100%. Editor привязки AI/CORE_DB/NEWS_DB и cron каждые 5 минут, Monitor DB/secret-name bindings и cron каждую минуту сохранены.
- После правки комментариев повторный [полный PR CI #43771645567](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43771645567) зелёный: **11 successful, 0 failed**, production jobs skipped до merge; [регрессии #43771645568](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43771645568) успешны.

**DEV-04 закрыт по техническому объёму.** Числа 32→4 и 20→3 относятся к Node тестам D1 API имитации. Это доказательство сокращения операций в алгоритме, **не** измерение latency, CPU или реального дневного расхода Cloudflare на production. Не утверждать, что самостоятельный браузерный/контентный QA уже проведён; это отдельный пункт TODO. OSS ветка и долгосрочные backup отложены по решению владельца.
