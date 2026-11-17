# QUALITY-03 — реальная группировка, атрибуция и редакционная локализация

**Дата:** 17 ноября 2026. **Статус:** production release + independent read-only content postcheck **PASS** для конкретной области C-02/C-03 и B-04. Полные продуктовые C-02/C-03/B-04 и global browser QA этим отчётом не закрываются.

## 1. Release evidence

- [PR #87](https://github.com/ArrakturIL/regional-osint-feeds/pull/87) — squash merged в `main` **`948cd327354ca755ec81c05deb094fdbd22c8684`**.
- [PR application CI #44014449716](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/44014449716) — **11 executed successful jobs**, source, frontend, Monitor, Editor, Pages and immutable three-component build; two Wrangler dry-runs succeeded. [Integrated data CI #44014449810](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/44014449810) — offline gate success; private Neon job deliberately skipped on PR.
- [main production CI #44014634962](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/44014634962) — **12 executed jobs SUCCESS**: 10 source + immutable bundle + coordinated release; rollback not needed.
- Independent Cloudflare postcheck: Pages deployment `6e827783-2016-4354-b8a1-3609d602b5be`, stage `success`, exact source SHA `948cd327...`. Editor deployed version `6a034e23-912f-4038-92c2-8d04af98ff91` **100%**, Monitor `1650e7e5-f285-4145-b301-d31dbea74d23` **100%**.

## 2. Live D1 before/after штатного Editor reconciliation

**Все запросы SELECT (read-only). Без ручной перезаписи, миграций, повторных AI или удаления источников.**

- Before: `editor_state.last_event_filter` = **2026-11-17T04:05:43.754Z**, `input=380, events=352, held=0, duplicated=28` (до релиза).
- After scheduled Editor scan: **2026-11-17T04:10:43.208Z**, `input=380, events=352, held=3, duplicated=25, publishers=10`.
- **Jordan Telegram**: Al Jazeera `1f89664ccac6d22774f50406` и Times of Israel `b610d2585c714cadf0690e73` оба остались в событии `evt_794d27b97173eaafacb4`, теперь **`topic=governance`**, `member_count=2`, `reason=same_regulatory_subject`; раньше ошибочно `topic=strike`. Два независимых издателя (`source_count=2, origin_count=2`) не объявлены независимым подтверждением смысла; `verification_status=multi_outlet_reporting`. Обоим `source_assertion=not_reported` (ранее контекст исторической гибели в церкви ошибочно трактовался как death claim самой блокировки).
- **Reprinted opinion**: JNS `b03547def283d8514388b319` и Arutz Sheva `3541b4fb507c55e28f89e683` больше **не входят в материализованные event groups**, source rows остаются в `news_items`; раньше ошибочно одна `negotiation` news-группа.
- **Different political actors**: Golan `849f6bcfae3f010eff88f561` остался отдельным `evt_c0425ad7e6914d399213` (member_count=1), Liberman's party `9358567e333e4bf39bfd3083` — отдельное новое `evt_c993927ac4108630212c` (member_count=1); раньше оба ошибочно `evt_c0425ad7e6914d399213`.
- **Positive control**: два источника об одном предупреждении Нетаньяху Европе, `eaf510ac24c90f3e8eb4f0d3` и `070417639a8bb6ba5cb3e4fd`, **остались объединены** в `evt_a23cedfff04dfd35aedb` (member_count=2).
- Кодовые правила нейтральные: action + regulatory object/temporal affinity; opinion URL/signoff; distinct explicit political subjects; background death context. Нет списков исключений по издателям, именам политиков или конкретным приложениям.

## 3. B-04 real Hebrew editorial API postcheck

`GET https://regional-watch.pages.dev/api/editorial-notes?lang=he&limit=3` = **HTTP 200**; все три проверенные заметки содержат `content_language=he`, `field_translation_status.headline=available`, `field_translation_status.text=available`, `field_translation_status.verified_note=pending`; `core_translation_status=available`, `pending_fields=['verified_note']`. Исходный RU `verified_note` сохранён, его перевод не придуман. **Overall** `translation_status=pending`, `localization_complete=false`, `localized_count=0` — это сознательно сохраняет строгий критерий полноты всех полей; интерфейс и суммарный показатель usable core notes требуют отдельной B-04/F задачи.

## 4. Новая проверенная ошибка B-02 (НЕ исправлена этим пакетом)

Свежий материал [Maariv от 17.11.2026](https://www.maariv.co.il/news/politics/article-1389233) сверяли с первоисточником (независимая публичная страница) и live RU API. Оригинальная фраза заголовка **`להשביע וללכת לבחירות`** в контексте `הקמת ממשלה` / `השבעה בדרך לבחירות` = привести правительство к присяге и затем идти на выборы. В актуальном RU API заголовок содержит **«Удовлетворить и идти на выборы»**. Это конкретный новый high-signal B-02 translation fidelity regression; только diagnostic finding, **не исправляли D1 text**, не списывать в отложенный исторический B-01. Нужен source-backed отдельный тест на контекст `להשביע` и проверка RU/HE после правки; избегать узкого хардкода ID одной статьи.

## 5. Границы и следующий backend-фокус

Пройденная область: C-02 observed real group correctness + C-03 historical context attribution + B-04 field-level editorial readiness. Остальные случаи группировки/происхождения, полный независимый фактчекинг, перевод `verified_note`, дополнительные P1 B-02, B-05 редакционный тон и E-01–04 источник/очередь остаются отдельно. Нет новых Worker, AI-оплаты, cron, секретов, D1/Neon миграций или frontend changes. Глобальный browser/content QA позже, ARCH-04/05 по решению владельца условно приняты для планирования до результатов назначенных независимых проверок.
