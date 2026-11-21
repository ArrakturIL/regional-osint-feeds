# REGIONAL WATCH — инструкции для ИИ-помощников

Читать первым. Действует для любого агента: Claude, GPT, Codex и других.

1. [docs/STATUS.md](docs/STATUS.md) — что в production, что открыто, решения владельца, запреты.
2. Живое состояние: `git log` на `main`, открытые PR, последние CI-прогоны. Если документ расходится с артефактами, верны артефакты; документ обнови.
3. По теме задачи — нужный документ из карты ниже, целиком не загружай.

## Карта документов

| Файл                                 | О чём                                   |
| ------------------------------------ | --------------------------------------- |
| `docs/STATUS.md`                     | состояние, очередь, решения владельца   |
| `docs/architecture/release.md`       | релиз, проверки, откат, секреты         |
| `docs/architecture/collectors.md`    | сборщики GitHub Actions → Neon → D1     |
| `docs/architecture/translations.md`  | конвейер переводов и проверок (блок B)  |
| `docs/architecture/tension-index.md` | индекс напряжённости: показатели, норма |
| `docs/gpt-automations.md`            | контракт плановых задач GPT с сайтом    |
| `docs/design/redesign-2077.md`       | дизайн-токены темы «2077»               |
| `scripts/qa/README.md`               | браузерные QA-скрипты                   |

Истории в репозитории нет: старые планы, аудиты и чекпойнты удалены 21.11 и доступны через `git log`.

## Структура

| Путь                             | Что                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `frontend/`                      | RU/HE UI (React без JSX, сборка по `build-order.json`), Pages                            |
| `backend/pages/`                 | Pages runtime, API, пульт `/ops`                                                         |
| `backend/editor/`                | Editor Worker: новости, переводы, аналитики, публичные API; cron `*/5`                   |
| `backend/monitor/`               | Monitor Worker: OSINT-адаптеры, статусы, запуск сборщиков; cron `*/1`                    |
| `scripts/`, `.github/workflows/` | Python-сборщики, релизные и QA-скрипты                                                   |
| `storage/`                       | схемы D1 и Neon                                                                          |
| `data/`                          | JSON-снимки сборщиков — fallback, если нет кэша D1; читаются через raw.githubusercontent |
| `config/`                        | реестры источников, флаги, бюджеты, глоссарий                                            |
| `deploy/`                        | production-конфиги Workers и контракт релиза                                             |

## Общение с владельцем

- Русский, на «ты», живой технический разговор. Не пересказывай поручение и не соглашайся с ошибочным предположением.
- Время — по Израилю (UTC+2), не UTC и не «Z».
- Не выдумывай успех, тесты, CI и ссылки. `CI green` ≠ `merged` ≠ `production` ≠ `live QA принят`.
- Итог этапа: одна строка результата (`**X закрыт.** ✅` или `⚠️`), абзац доказательств (PR, CI), где записано, граница (что в production, что не трогали, что дальше). На обычный вопрос просто отвечай.

## Как работать

- Баг: доказательство (код, лог, D1 SELECT) → тест RED → фикс GREEN. Чини **класс** ошибки, а не один пример. Одна причина — одно изменение.
- Тесты поведенческие, через настоящий entrypoint (`index.scheduled` / `fetch`), а не по подстрокам исходника. Тесты переводов — на `node:sqlite` (`tests/architecture/editor-d1-fixture.mjs`).
- Сборка до тестов: `node frontend/scripts/build-site.mjs` и esbuild-бандлы (команды — в `regional-watch-app-check.yml`, job `modern-bundles`). Тесты: `node --test tests/architecture/*.test.mjs frontend/tests/*.test.mjs backend/*/tests/*.test.mjs`; Python — `python -m unittest discover -s scripts -p 'test_*.py'`.
- Полная реализация, без MVP-заглушек. Экономь токены и агентов.
- Документы для владельца — на русском. Коротко (ориентир — до 8–10 КБ на файл), без истории и логов: подробности — в PR. После проверенного изменения обнови `docs/STATUS.md`.
- PR создавай через `gh api repos/…/pulls` (GraphQL закрыт). Push — `git -c push.negotiate=true push`. Merge — squash, **по одному**: следующий только после окончания релиза предыдущего.

## Подводные камни

- Новый тест-файл добавь в явный список `.github/workflows/regional-watch-app-check.yml`, иначе CI его не запустит.
- Новый или удалённый модуль меняет счётчики:
  - `tests/architecture/arch07-integration-acceptance.test.mjs` — модули и рёбра импортов, сейчас 107 и 276; Editor — 54;
  - `editor-cross-component-acceptance`;
  - Monitor: `backend/monitor/build-order.json` и `source-parity` (44);
  - frontend: `frontend/build-order.json` и `source-parity` (61).
- Сборщик без JSON в git (как ADS-B): вне `GITHUB_JSON_SOURCES`, но в `MIRROR_SOURCES` Monitor и в CHECK `source_key` обеих схем (см. `docs/architecture/collectors.md`).
- D1 CORE: без `ALTER TABLE … RENAME`, таблицу пересоздавать копированием.
- Preview Pages делит D1 и Workers с production. Запросы, меняющие состояние, на preview не делать.

## Запреты без явного разрешения владельца

Production merge/deploy · запись в production D1/Neon · cron, секреты, платные квоты, AI-лимиты · новые Workers · смена цепочек моделей в `router.mjs`. Разрешение, данное одному агенту, другим не передаётся.

## GPT (ChatGPT)

- Плановые задачи GPT работают по [docs/gpt-automations.md](docs/gpt-automations.md): что читать, куда писать, правила проверки и перевода.
- Дополнительные правила GPT хранятся в ChatGPT Library: `/Regional Watch/00_CURRENT/REGIONAL_WATCH_GPT_ONLY_RULES.md`. При противоречии верен репозиторий.
- Код и инфраструктуру GPT не меняет.
