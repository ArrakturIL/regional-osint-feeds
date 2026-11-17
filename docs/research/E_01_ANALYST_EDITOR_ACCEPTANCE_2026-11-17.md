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

Связанные документы: [MASTER TODO §44–45](../REGIONAL_WATCH_MASTER_TODO.md), [AGENTS.md](../../AGENTS.md).
