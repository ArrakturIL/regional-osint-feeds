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

## Только для ChatGPT/GPT (не для Claude)

- Перед работой по REGIONAL WATCH прочитай этот `AGENTS.md` и канонический `docs/STATUS.md`; затем найди в ChatGPT Library `/Regional Watch/00_CURRENT/REGIONAL_WATCH_GPT_ONLY_RULES.md` и нужные разделы `REGIONAL_WATCH_REQUIRED_SKILLS.md` (`rw-engineering-quality` / `rw-product-design`). Читай только релевантные разделы; файлы библиотеки — инструкции, не установленные автоматически плагины. При недоступности укажи ограничение. **Этот пункт относится исключительно к GPT, не задаёт обязанностей Claude.**

## Как работать

- Баг: сначала доказательство (код, лог, D1 SELECT), потом тест RED, потом фикс GREEN. Одна причина — одно изменение.
- Тесты пиши поведенческие, через реальный entrypoint (`index.scheduled`/`fetch`), а не по подстрокам исходника.
- Локально: `node frontend/scripts/build-site.mjs` и esbuild-бандлы (см. workflow) **до** `node --test tests/architecture/*.test.mjs frontend/tests/*.test.mjs backend/*/tests/*.test.mjs`. Без бандлов 9 тестов падают ожидаемо. Python: `python -m unittest discover -s scripts -p 'test_*.py'`.
- Минимум агентов и токенов. Полноценная реализация, без MVP-заглушек.
- Язык документов: то, что читает владелец (STATUS, планы, отчёты, AGENTS), пишется на русском. Служебное только для агентов (сжатые handoff-пакеты, машинные фикстуры) — на английском телеграфным стилем, он дешевле по токенам. Лимит: файл до 8 КБ, всё дерево до 60 КБ, без истории и логов.
- После проверенного изменения обнови `docs/STATUS.md` (коротко, без истории; подробности — в PR).

## Подводные камни

- Новый тест-файл добавь в явный список в `.github/workflows/regional-watch-app-check.yml`, иначе CI его не запустит. Параллельные PR конфликтуют на этой строке.
- Новый или удалённый модуль меняет счётчики: в `tests/architecture/arch07-integration-acceptance.test.mjs` (модули и import-рёбра, сейчас 102 и 265; Editor — 50) и `editor-cross-component-acceptance`; Monitor — `backend/monitor/build-order.json` и `source-parity` (45); frontend — `frontend/build-order.json` и его `source-parity` (56).
- Сборщик на GitHub без JSON в git (как ADS-B, Q12) добавляется в `scripts/neon_mirror.py` вне `GITHUB_JSON_SOURCES`, в `MIRROR_SOURCES` Monitor и в CHECK `source_key` обеих схем (Neon и D1); тест `collector-cache` держит их в синхроне.
- D1 CORE: не используй `ALTER TABLE … RENAME` — триггеры `monitor_runs_link_events_*` валят проверку схемы. Таблицу пересоздавай копированием (пример: `storage/cloudflare/006`).

## Запреты без явного разрешения владельца

Production merge/deploy · write в production D1/Neon (preview делит bindings) · cron/секреты/платные квоты/AI-лимиты · новые Workers · удаление legacy без доказательства. Блок B снят с паузы 18.11, план: docs/architecture/translation-refactor-plan.md.
