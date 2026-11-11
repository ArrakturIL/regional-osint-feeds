# Pages aviation UI contract (pending frontend integration)

**Backend already deployed:** `regional-osint-monitor` writes to D1 `regional-osint` and exposes an authenticated `/summary` response. **The Pages frontend is a separate direct-upload deployment.** Do not assume the UI already consumes the new fields, and do not expose `SUMMARY_TOKEN` to client JavaScript.

## Recommended Pages Functions integration

The Pages production deployment already has a `DB` D1 binding. A server-side Pages Function should read the same D1 tables directly and return a **sanitized, read-only** `/api/aviation-status` response, without putting the Worker summary token into the browser.

Use bounded queries, for example:

```sql
SELECT source,observed_at,
  json_extract(payload,'$.area') AS area,
  json_extract(payload,'$.observed_aircraft') AS observed_aircraft,
  json_extract(payload,'$.sample_status') AS sample_status,
  json_extract(payload,'$.missing_callsign') AS missing_callsign,
  json_extract(payload,'$.military_db_flagged') AS military_db_flagged,
  json_extract(payload,'$.airlift_type_observed') AS airlift_type_observed,
  json_extract(payload,'$.tanker_type_observed') AS tanker_type_observed
FROM observations
WHERE source IN ('adsb','adsb_alt') AND observed_at >= ?
ORDER BY observed_at DESC LIMIT 200;
```

Filter `area='tehran'` server-side and use `source_status` to decide freshness. Avoid trusting a last stored zero as a current count. The existing Worker `/summary` has an `aviation_focus` implementation that can be used as the reference behavior.

For corridor context:

```sql
SELECT observed_at,payload FROM observations
WHERE source='airbridge_context' AND observed_at >= ?
ORDER BY observed_at DESC LIMIT 30;
```

Do not send full payload URLs or per-aircraft identifiers to the client. Aggregate six named regions into counts of **snapshots**, not unique flights.

## Display states

| API/UI state | Russian label | Count |
|---|---|---|
| `aircraft_observed` | «В замере: N бортов» | Only from a fresh successful sample |
| `zero_in_sample` | «0 в этом замере» | Only from a fresh successful sample |
| `no_recent_sample` | «Нет свежего замера» | Current count = null; last count separate |
| `source_unavailable` | «Источник недоступен» | Current count = null |
| `quota_reserved_for_tehran` | «Ограничение API — приоритет Тегерану» | Current count = null unless an independently fresh sample exists |
| `partial` | «Неполное покрытие» | Never imply complete regional coverage |

Show source, timestamp and radius next to each sample. In the corridor panel use **«Контекст воздушного коридора»** and label type/database matches as **indicators, not verified US military flights**.

Visible attribution: **Data: AvioADSB (CC BY-NC 4.0)**, linked to https://avioadsb.org. The source is noncommercial and best-effort.

## Frontend acceptance tests

1. A fresh 0 is shown as a *single snapshot*, not «в небе пусто».
2. A three-hour-old 0 renders «Нет свежего замера» and a separate historical timestamp.
3. A source error overrides a fresh-looking historical count.
4. A quota skip does not update last-success timestamp.
5. The corridor panel never renders six unrelated snapshots as a transatlantic route.
6. The Pages site works when the aviation sources are unavailable, without blanking unrelated news and maritime data.

**Status:** This document is an integration contract, not a claim that the Pages frontend has been deployed with these changes.
