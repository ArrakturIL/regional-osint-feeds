# REGIONAL WATCH — checkpoint после переноса архитектуры (2026-11-15)

## Проверенный статус
- PR #23 **squash-merged** в `main`: https://github.com/ArrakturIL/regional-osint-feeds/pull/23
- Итоговый SHA слияния: `9b0ea025ce0464398249a5c038485a21814cff28`.
- Основной сайт: https://regional-watch.pages.dev — Cloudflare Pages production deployment `86cd2f80-d892-4eaf-a491-183f86027eb0` (branch `main`).
- CI на объединённом SHA: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43667662327 — все 10 проверок и публикация production **success**; read-only smoke маршрутов проверил 200 на RU/HE, статических ресурсах и вложенных ссылках.
- Тестовый alias: https://rw-modular-preview.regional-watch.pages.dev, последний проверенный preview: https://cd1dbf59.regional-watch.pages.dev.
- Предыдущая рабочая production сборка до миграции: Pages deployment `0f39f36e-9299-46fd-9bdd-be112ece95f6` (см. `baselines/cloudflare/2026-11-14/`), доступна для восстановления через Cloudflare Pages Deployments.
- Постоянно обновляемые `data/*.json` из `main` сохранены, ветка рефакторинга этих данных не меняла.

## Архитектура и исправления
- Монорепозиторий с `frontend/`, `backend/pages/`, `backend/monitor/`, `backend/editor/`, `shared/`, `tests/architecture/`.
- JS — детерминированная сборка из ES-модулей в совместимый legacy React IIFE, современная ESM/esbuild сборка проходит отдельно.
- CSS разделён по компонентам и страницам, собирается детерминированно в один браузерный файл. Восемь старых inline `<style>` устранены. Добавлены настройки читаемости, контраста, интервалов и RU/HE.
- Исправлено зацикливание Cloudflare Pages `/index.html` при обращении к главным страницам.
- Исправлена главная лента: больше нет JS masonry row-span / dense перестановок, карточки располагаются ровными строками в исходном порядке.
- Исправлена ивритская подпись источников: LTR-число выделено `<bdi dir="ltr">`, отступ стабилен для RTL.
- Регрессионные тесты в `frontend/tests/styles.test.mjs`, `frontend/tests/source-parity.test.mjs`, Pages runtime tests.

## GitHub Actions
- `.github/workflows/regional-watch-app-check.yml`: source/architecture suite на PR и code-changing pushes.
- Feature-ветка публикует **preview**, `main` после зелёного CI публикует **production** через `cloudflare/wrangler-action`.
- `push.paths` отфильтровывает *data-only* изменения в `main`, чтобы RSS/GDELT/аналитики не пересобирали сайт каждый раз.
- Конвейер сайта **не** публикует Monitor/Editor Workers. Для них всё ещё существует отдельный продакшн-процесс.
- GitHub Secrets: `CLOUDFLARE_API_TOKEN` (Pages Edit), `CLOUDFLARE_ACCOUNT_ID`. Не записывать значения в репозиторий.

## Ограничения / дальнейшая работа
1. Пользователь выполняет отдельный полный **QA сайта**, включая UI и API на русском/иврите, маршруты, mobile/desktop и обработку ошибок. Публикация и CI не заменяют этот QA.
2. Preview использует те же реальные DB / NEWS_DB / EDITOR / MONITOR bindings, что и production. **Не запускать изменяющие данные тесты в preview**.
3. Частые GitHub Action коммиты с JSON-снимками продолжают существовать. Хранилище ещё не реформировано. **R2 не активирован, API вернул 403 / 10042, пользователь отложил его и поручил позднее найти альтернативную бесплатную DB/объектное хранилище**. Подробности в `docs/architecture/REGIONAL_WATCH_STORAGE_BACKLOG_2026-11-15.md`.
4. Скрипты фронтенда до сих пор ориентированы на совместимую IIFE-сборку ради безопасного перехода; настоящая замена legacy React runtime — отдельная задача, не включена в миграцию.
5. Ветка `refactor/regional-watch-modular-20261114` сохранена до окончательного QA; при squash merge промежуточные коммиты не попали в историю `main`.
