# E-01 — независимая приёмка Analyst Editor, 17.11.2026

**Статус: NOT ACCEPTED / OPEN.** Отчёт по штатному запуску после production deployment 2026-11-17T04:31:38Z. Источник цифр — выполненная ранее read-only проверка, изложенная в чате; этот коммит лишь сохраняет её результат, не является повторной независимой проверкой D1.

## Штатный запуск

- Время UTC: 2026-11-17 05:30:42–05:30:52 (после deployment).
- `analyst_runs.status=partial`; `error_message=mirror_missing_incomplete_or_stale` — прежняя ошибка повторилась.
- `discovered=0`, `published=0`, `processed=0`; `pending=59`, `partial_sources=1`, `budget_exhausted=1`.
- В опубликованной выборке 27 материалов, 27 уникальных ID/URL; дубли не обнаружены в этой выборке.
- 59 pending, oldest created_at 2026-11-13T16:30:42Z; 16 needs_data, 182 skipped (срез состояния D1, не обязательно счётчики именно одного запуска).

## Cache / bindings / диагностический блокер

- Private CORE D1 `regional_collector_cache['analysts']`: 40 items, `state=ok`, `checked_at=2026-11-17T03:45:40Z`; проверенные SHA-256 совпали.
- Production Editor deployment с 04:31:38Z подтверждён на 100%; bindings `CORE_DB` и `REGIONAL_EDITOR_CACHE_SOURCES` включают `analysts,news_translation`.
- Несмотря на валидный private D1 cache, запуск снова выдал `mirror_missing_incomplete_or_stale`. По имеющейся записи нельзя доказать, читал ли Editor private D1 cache либо использовал stale GitHub mirror. **Точный нерешённый вопрос:** фактическая ветка выбора источника и причина ошибки при наличии свежего D1 cache. Нужны подтверждающие runtime logs/trace, без догадок.
- Отсутствие дублей доказано лишь для опубликованной выборки, а не для всех потенциальных повторных попыток.

## GDELT (короткий контроль, не ARCH-05)

- `data.latest_batch=20261115234500`, `status.last_batch=20261117041500`: прежнее отставание не сократилось в проверенном срезе.
- Полную ARCH-05 не дублировали.

## Границы

Только фиксация результата прежней read-only проверки. Не запускались внеплановый Editor/AI, не менялись code, Workers, production, D1/Neon, secrets, cron, quotas. ARCH-04 (20.11) и ARCH-05 (18.11) не дублировать. E-01 не закрывать до доказанного устранения ошибки и подтверждённого штатного запуска без неё.

## Повторная read-only сверка 17.11.2026, 15:30 UTC

- После первоначально зафиксированного сбоя 05:30 UTC проверена CORE D1 `analyst_runs` без записи/ручного запуска. Последние три штатных цикла (13:30, 14:30 и **15:30 UTC**) все `partial`, `error_message=mirror_missing_incomplete_or_stale`, `discovered=0`, `processed=0`, `published=0`, `partial_sources=1`, `budget_exhausted=1`, `pending_count=59`. Последний run `analyst-editor-v1.1.2-translation:498591` начат 2026-11-17T15:30:42.726Z, завершён 15:30:48.199Z.
- CORE D1 `regional_collector_cache['analysts']` обновлён штатным сборщиком: `checked_at=2026-11-17T12:33:12Z`, `state=ok`, data JSON 32743 байта. Таким образом, повторяемость ошибки и наличие cache подтверждены; **не доказано**, использовал ли данный цикл именно этот кэш или fallback и какой конкретный guard вернул ошибку. Нужна трассировка ветки выбора и freshness-контракта.
- Последний проверенный цикл 15:30 UTC был **до** следующего coordinated PR #91 release в 16:01 UTC. PR #91 касается UI archive; сам по себе не является исправлением E-01 и не даёт права закрыть этот дефект.
- Независимо в том же read-only срезе CORE D1 cache GDELT: `data.latest_batch=20261116014500` против `status.last_batch=20261117134500`, **36 часов** отставания; `source_status.gdelt_context=error`, `detail=unexpected GDELT source batch date`. Не считать `checked_at` датой опубликованного события и не подменять источник. Это диагностический факт E-02/ARCH-05, а не закрытая задача.

**Вывод:** E-01 остаётся **OPEN / FAILED ACCEPTANCE**. Прежняя ошибочная надежда на автоматическое восстановление после следующего цикла не подтверждена. Запланированные ARCH-04/05 не дублировались; AI/quota/cron/secret/production не менялись.

Связанные документы: [MASTER TODO §44–45](../REGIONAL_WATCH_MASTER_TODO.md), [AGENTS.md](../../AGENTS.md).
