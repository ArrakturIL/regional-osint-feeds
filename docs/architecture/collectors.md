# Сборщики данных: GitHub Actions → Neon → D1

## Схема

1. **Сбор.** Python-сборщик в GitHub Actions (`scripts/collect_*.py`, `.github/workflows/*.yml`) забирает публичный источник и проверяет данные.
2. **Neon** (проект `regional-watch-data`, ID `weathered-resonance-71661530`, база `regional_watch`). Источник истины для снимков. Таблица `regional_collector_snapshots` хранит атомарную пару `data` + `status` (JSONB), их SHA-256 и `checked_at`.
3. **D1 `regional-osint`.** Приватная копия для чтения, таблица `regional_collector_cache`. Её читают Monitor (binding `DB`) и Editor (`CORE_DB`). `scripts/neon_to_d1.py` делает upsert «только новее» и затем проверку чтением (данные, статус, хэш). Расхождение — отказ, ничего не перезаписывается.
4. Публичные страницы и Workers в Neon не ходят. Ключи Neon есть только у сборщиков на сервере.

## Источники

- Восемь источников с JSON (`analysts`, `centcom`, `copernicus`, `gdelt`, `marad`, `satellite`, `unosat`, `news_translation`) — `graduated` (`config/collector-rollout.json`). Читаются из D1 с проверкой хэша. При пропаже или порче кэша срабатывает fallback на снимок в `data/`.
- `adsb` и `adsb_mil` (с 19.11) идут только через Actions → Neon → D1, JSON в git нет. Их нет в `GITHUB_JSON_SOURCES` (`scripts/neon_mirror.py`), но они есть в `MIRROR_SOURCES` Monitor и в CHECK `source_key` обеих схем. Тест `collector-cache` держит это в синхроне.
- Посетители сайта (`site-visitors.yml`): Cloudflare Web Analytics → `usage_daily`. Neon здесь не участвует.

## Расписание

Сборщики запускает Monitor через `workflow_dispatch` (SYS-01), потому что cron GitHub ненадёжен. Расписание и смещения — `backend/monitor/src/schedule/`. Включение и отключение отдельного источника — `config/source-controls.json` и `source-control.yml`, без релиза.

## Правила Neon (upsert)

- Новая запись принимается.
- Более новый `checked_at` заменяет пару целиком; более старый отклоняется.
- Тот же `checked_at` и тот же хэш — без изменений.
- Тот же `checked_at`, но другой хэш — конфликт, ничего не перезаписывается.
- Документ — до 1 МиБ. Время в будущем больше чем на 20 мин — отказ.

## Добавить источник

1. Сборщик и тесты в `scripts/`, workflow с `workflow_dispatch`.
2. Схемы `storage/neon/` и `storage/cloudflare/` (CHECK `source_key`). D1 CORE — без `RENAME`.
3. `MIRROR_SOURCES` Monitor, расписание в `backend/monitor/src/schedule/`, тест `collector-cache`.
4. Без JSON в git — вне `GITHUB_JSON_SOURCES`.

## Проверка вручную

`python -m unittest discover -s scripts -p 'test_*.py'`; `scripts/audit_collector_cache.py` сверяет Neon и D1 по каждому источнику.
