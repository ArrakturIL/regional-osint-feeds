# Browser QA kit (Playwright, read-only)

Agent-facing. Every script takes BASE as argv[1] (default `https://regional-watch.pages.dev`), only reads the site, mocks API failures in the browser (`page.route`), never writes data.

Setup: `pip install playwright && python -m playwright install chromium`.

| Script                  | Checks                                                                                                                                                       | Baseline 18.11 (Claude)                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `layout_a11y.py`        | 8 routes × 390/719/1363: overflow, unnamed controls, touch targets <32 px (mobile), img alt, `aria-current`, `lang`/`dir`, console errors → `qa_layout.json` | clean; only inline ADS-B links in `/data` text are small (WCAG inline exception)  |
| `keyboard_deeplinks.py` | Tab order + focus ring, skip link, Enter on nav, Back/Forward, RU↔HE switch, card expand Enter/Space, deep links (`/events#x`, `/data/`, `/xyz`)             | clean; `/xyz` → 200 + home (known soft 404)                                       |
| `header_nav.py`         | header links route in-app (no reload: `window.__alive` survives), `aria-current`, focus → `#main-content`, Back                                              | clean                                                                             |
| `failure_states.py`     | first visit with API 503 / 429 / broken JSON on `/`, `/events`, `/data` RU/HE; last-good after failed refresh (`page.clock`)                                 | human text + retry; last-good note shown                                          |
| `feed_filters.py`       | news archive filters on `/events`: control sizes, labels, 16 px fields, sort via keyboard, Enter applies, reset, empty state                                 | clean                                                                             |
| `digest_layout.py`      | «Что изменилось» grid: columns per width, clipping, radius                                                                                                   | clean                                                                             |
| `lang_leak.py`          | Cyrillic on `/he/*`, Hebrew on RU pages, incl. expanded cards (new, not yet run)                                                                             | known: dossier `gaza-board-of-peace-ceasefire-risk-report-20261118` HE has «РБК:» |
| `mobile_perf.py`        | LCP/FCP, requests, KB, fonts; Slow 4G + CPU×4, 390 px; `argv[2]` = runs                                                                                      | LCP RU ~2.4 s, HE ~1.4 s; accepted by owner (STATUS #15)                          |
