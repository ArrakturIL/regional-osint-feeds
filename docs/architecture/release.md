# Релиз и откат

## Как выкатывается код

- Код попадает в production только через merge в `main`. Workflow `.github/workflows/regional-watch-app-check.yml` прогоняет тесты, собирает **один** неизменяемый бандл (Pages + Editor Worker + Monitor Worker) от `github.sha` и публикует его без пересборки.
- Релиз запускают только пути приложения (`push.paths`). Изменения в `docs/` и коммиты данных сборщиков релиз не запускают.
- Порядок публикации: Editor → Monitor → Pages, затем короткий технический smoke по HTTP (контент и UI не проверяет).
- В манифест входят SHA-256 и размеры всех файлов, хэши SQL-миграций D1, `config/collector-rollout.json` и контракт развёртывания `deploy/release-contract.json`.

## Проверки перед публикацией (`scripts/release/`)

- Все секреты нужны до первой записи. Если их нет, релиз падает раньше, чем что-то изменится.
- Через Cloudflare API сверяются схемы таблиц D1, bindings, cron и маршруты Workers и Pages. При расхождении деплоя не будет.
- У обоих Workers должно быть `preview_urls: false` (`deploy/wrangler.*.production.json`). Preflight и postcheck читают это обратно. Wrangler однажды молча включил preview-URL, поэтому проверка обязательна.
- **Миграции D1 при релизе не выполняются никогда.** Схему меняют отдельно и вручную (`storage/cloudflare/*.sql`). В D1 CORE нельзя `ALTER TABLE … RENAME`: таблицу пересоздают копированием, как в `006`.

## Откат

- Перед публикацией релиз запоминает текущие версии Workers и deployment Pages. Это `rw-coordinated-rollback-baseline` в artifacts.
- При сбое после этого шага `cloudflare-gate.mjs rollback` возвращает обе версии Workers (100%) и предыдущий deployment Pages. Ошибка отката тоже красит job.
- Откат кода не отменяет записи в D1.
- Ручной откат делается через Cloudflare → Deployments по baseline из artifacts.

## Секреты GitHub Actions

| Секрет                       | Для чего                                    |
| ---------------------------- | ------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`       | Pages                                       |
| `CLOUDFLARE_D1_API_TOKEN`    | D1 и Workers Admin (общий инфраструктурный) |
| `CLOUDFLARE_ACCOUNT_ID`      | аккаунт                                     |
| `CLOUDFLARE_ANALYTICS_TOKEN` | GraphQL: квоты и посетители                 |

Значения секретов не коммитить и не печатать.

## Известный риск

Если смёржить два PR подряд, они могут выкатиться не по порядку: 20.11 #199 опубликовался после #200 и откатил его. Мержить по одному, дожидаясь окончания релиза.

## Preview

Preview-деплой Pages делит с production **те же** D1 и Workers, это не песочница. Запросы, меняющие состояние, на preview не делать.
