# REGIONAL WATCH — инструкции для помощников

**Сначала прочитай [docs/STATUS.md](docs/STATUS.md)** (одна страница: production, открытые задачи, запреты). Затем сверь живое состояние: `git log` на `main`, открытые PR, последние CI runs. Если документ расходится с артефактами, верь артефактам и обнови документ. История лежит в `docs/archive/`, доказательства в `docs/research/`. Читай их только при необходимости, целиком не загружай.

## Общение с владельцем

- Русский, на «ты», живой технический разговор. Не пересказывай поручение, не раздувай ответы, не соглашайся с ошибочным предположением.
- Не выдумывай успех, тесты, CI и ссылки. `CI green` ≠ `merged` ≠ `production` ≠ `live QA принят`.
- Итог этапа: результат одной строкой (`**E-01 закрыт.** ✅` или `**E-01 — не закрыт.** ⚠️`), затем абзац доказательств с точным PR/CI, затем где записано (STATUS/PR), затем граница: что в production, что не трогали, следующий шаг. На обычный вопрос просто ответь, без шаблона.

## Структура

| Путь | Что | В release? |
|---|---|---|
| `frontend/` | RU/HE UI (React без JSX, сборка по `build-order.json`) | да (Pages) |
| `backend/pages/` | Pages runtime и API proxy | да |
| `backend/editor/` | Editor Worker: новости, переводы, аналитики, публичные API, cron `*/5` | да |
| `backend/monitor/` | Monitor Worker: OSINT-адаптеры, статусы, cron `*/1` | да |
| `scripts/`, `.github/workflows/` | Python-сборщики → Neon → private D1, релизные скрипты | сборщики отдельно |
| `storage/`, `data/` | схемы D1/Neon, замороженные (с 15.11) JSON-снимки для fallback | — |
| `worker/`, `baselines/`, `site/` | legacy и frozen baselines | **нет** |

## Как работать

- Баг: сначала доказательство (код, лог, D1 SELECT), потом тест RED, потом фикс GREEN. Одна причина — одно изменение.
- Тесты пиши поведенческие, через реальный entrypoint (`index.scheduled`/`fetch`), а не по подстрокам исходника.
- Локально: `node frontend/scripts/build-site.mjs` и esbuild-бандлы (см. workflow) **до** `node --test tests/architecture/*.test.mjs frontend/tests/*.test.mjs backend/*/tests/*.test.mjs`. Без бандлов 9 тестов падают ожидаемо. Python: `python -m unittest discover -s scripts -p 'test_*.py'`.
- Минимум агентов и токенов. Полноценная реализация, без MVP-заглушек.
- Язык документов: то, что читает владелец (STATUS, планы, отчёты, AGENTS), пишется на русском. Служебное только для агентов (сжатые handoff-пакеты, машинные фикстуры) — на английском телеграфным стилем, он дешевле по токенам. Лимит: файл до 8 КБ, всё дерево до 60 КБ, без истории и логов.
- После проверенного изменения обнови `docs/STATUS.md` (коротко, без истории).

## Запреты без явного разрешения владельца

Production merge/deploy · write в production D1/Neon (preview делит bindings) · cron/секреты/платные квоты/AI-лимиты · новые Workers · удаление legacy без доказательства. Блок B снят с паузы 18.11, план: docs/architecture/translation-refactor-plan.md.
