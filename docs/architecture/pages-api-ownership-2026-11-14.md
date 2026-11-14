# Pages API migration — ownership table
Date: 2026-11-14. No deployment to production; existing Page Worker source is unavailable.

| Path group | Owner | Existing binding | Notes |
| --- | --- | --- | --- |
| /, /he, /events, /he/events, /data, /he/data, /analysts, /he/analysts | Pages static | ASSETS | Eight exact HTML snapshots already stored |
| /assets/* | Pages static | ASSETS | React 18.3.1, ReactDOM 18.3.1-next, JS and CSS are locally packaged |
| /api/news, /api/events, /api/stories, /api/editorial-notes, /api/changes, /api/languages | Editor | EDITOR | Existing Editor v64; whitelist exact public routes |
| /api/analysts, /api/analyst-posts, /api/analyst-posts/:slug, /api/official-posts | Editor | EDITOR | Keep original query string and status codes |
| /api/rw/aviation, /api/rw/satellite | Monitor publication filter | MONITOR | Monitor v47 exposes /api/aviation-analysis & /api/satellite-analysis; **do not show raw observations** |
| /api/rw-localized/aviation, /api/rw-localized/satellite | Monitor publication filter | MONITOR | Only accept actual HE-localized fields; never label English as Hebrew |
| /api/overview, /api/data | Pages D1 aggregate | DB + NEWS_DB | Must reproduce existing schema and exclusion rules before release |
| /api/rw-localized/analysts, /api/rw-localized/profiles | Pages locale adapter | EDITOR, DB | Locale fallback and ready-only filtering still to implement |

Existing Cloudflare Pages bindings verified: `DB` = regional-osint, `NEWS_DB` = regional-watch-news, `EDITOR` = regional-watch-editor production, `MONITOR` = regional-osint-monitor production.

**Release gate:** all API paths must have real implementations and live parity tests. Never introduce a preview-only placeholder into production. No unowned endpoint automatically forwarded to Editor or Monitor; never expose /api/translation-queue via Pages. No request to any older Pages deployment.
