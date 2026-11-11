# Regional Watch: free satellite and aerial scene discovery (11 Nov 2026)

## Live backend integration

Worker: `regional-osint-monitor`. Sources are separate from UI and from the existing NASA GIBS/EONET satellite snapshots. No EUMETSAT/EUMETView integration is requested.

### 1. Sentinel catalog — Element 84 Earth Search

- API: `https://earth-search.aws.element84.com/v1/search` (public STAC v1).
- Collections: `sentinel-2-l2a` (optical, some bands 10 m/pixel), `sentinel-1-grd` (SAR).
- Cloudflare live one-shot probes on 2026-11-11 returned HTTP 200 for both. Tehran example scenes: Sentinel-2 acquired 2026-11-09, Sentinel-1 acquired 2026-11-11.
- Production source name: `sentinel_catalog`. **One API request every 3 hours: 8/day, cycling through two collections and four broad-area bounding boxes** (Tehran, Strait of Hormuz, Persian Gulf, southern Red Sea).
- Search interval: last 21 days, newest first, 8 scenes max per request. D1 stores stable scene IDs, acquisition timestamps, collection/platform, bbox, cloud percentage when available, STAC item URL and a thumbnail link when HTTPS/allowlisted.
- Not downloading full 10-m pixels or performing automated image comparison. Discovery is not evidence of a specific aircraft, ship, incident or infrastructure change.
- The Earth Search public service does not guarantee uptime. A separate D1 provider lease/backoff guards 429/403 and consecutive failures.

### 2. OpenAerialMap archive catalog

- API: `https://api.openaerialmap.org/meta`, open JSON metadata. Catalog-level license currently reported as CC-BY 4.0, but check each image's attribution and reuse terms before redistribution.
- Cloudflare one-shot probe returned HTTP 200. Regional bbox results during that test:
  - Tehran — 0 catalog records.
  - Strait of Hormuz — 1 historical record (2021-03-06).
  - Persian Gulf — 0 records.
  - Southern Red Sea — 4 historical records, one example acquired in 2024.
- Production source: `aerial_archive`. **One regional bbox request per day**, rotating the same four areas, at most three entries per query.
- Stores metadata and original acquisition date only, not source images or extrapolations about current conditions. A valid empty result represents *no matches for that query*, never a failed API or proof of no imagery elsewhere.

### Source quality and operational constraints

- All provider errors and rate-limit decisions are separate from valid empty catalog responses.
- Throttling state and cooldown use the existing `worker_provider_state` D1 table with per-source keys; original adsb.lol and AvioADSB quotas remain isolated.
- Source quality/coverage is explicitly non-exhaustive: sampled STAC pages and uneven image footprints are not a complete satellite survey.
- D1's existing 90-day retention still applies; source item URLs remain as provenance. Same scene / region / metadata payload de-duplicates across successive successful catalog polls.
- Neither source affects UI code, the US–Iran automation, Cloudflare billing/subscriptions or other worker schedules.

## Candidates held back

- **Global Fishing Watch SAR/dark vessels**: official non-commercial API requires an individual bearer token. Registration and token creation: https://globalfishingwatch.org/our-apis/tokens/ ; documentation: https://api-doc.globalfishingwatch.org/our-apis/documentation/docs/authentication . Not connected without a user-provided token. SAR/AIS coverage is delayed and must not be treated as real-time vessel movement.
- **NASA Black Marble**: genuine daily corrected-night-light science data (VNP46A2) requires a proper acquisition and cloud/mask baseline pipeline; avoid treating isolated brightness changes as outages or attacks. Native files at https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/VNP46A2 ; no collector yet.
- **Copernicus EMS Mapping**: official public endpoints: unified https://mapping.emergency.copernicus.eu/activations/api/activations/ ; Rapid Mapping https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/ ; Risk & Recovery https://riskandrecovery.emergency.copernicus.eu/api/public-activations/ . Direct Cloudflare request to the unified API returned HTTP 403, but a one-time GitHub Actions test on 2026-11-11 returned **HTTP 200 and valid JSON from all three** (catalog counts: unified 1,069; Rapid Mapping 268; Risk & Recovery 43). Verified in https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43092265372 . The temporary test workflow was deleted after collecting results. GitHub Actions can therefore be used as a lawful public metadata collector with a bounded schedule and JSON mirror; **no automatic production collector is enabled yet**. CEMS activation products are crisis-event maps, not continuous current high-resolution imagery.
- **GPSJAM**: useful free browser map for daily GNSS anomaly context, but no verified bulk official API for automatic backend use; not connected.
- **Microsoft Planetary Computer**: public STAC alternative; overlaps the already working Earth Search catalogs, not justified as an additional scheduled source at this point.
- **EUMET/EUMETView**: explicitly excluded by user.

## Production verification

- **Cloudflare Worker version 36** (`74793a53-ad84-4e78-9913-dff0a9a3efe8`) is deployed to 100% of traffic, with the original five bindings and `*/1 * * * *` cron unchanged.
- GitHub Actions run [43091261040](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43091261040) passed all Worker syntax and regression checks.
- An initial smoke run failed **before network access** because Cloudflare Workers do not support `fetch(..., {redirect:"error"})`. This was reproduced in a temporary probe. The fix uses `redirect:"manual"`, so unexpected redirects yield non-200 responses without automatic following. The temporary probes were deleted.
- The two one-hour backoffs from that local error were reset only for these two new providers; no ADS-B provider state changed.
- A second D1 manual run, `geo_catalog_smoke_retry_20261111`, completed successfully at 2026-11-11 19:55 UTC: `sentinel_catalog` reported **partial** because the STAC result page was capped, with **8 new Sentinel-2 records** for southern Red Sea, acquired **2026-11-10**, and `aerial_archive` reported **empty** because its selected geographic bounding box had no matching archival images. Both `succeeded_at` timestamps advanced properly.
- Historical acquisition timestamps are stored separately from collection timestamps. **No imagery has been rendered or downloaded at native 10-m resolution**, and no automatic change detection is claimed.

### Check the result, not just the deployment

1. GitHub Action `Validate Regional Watch Worker`: `worker/test-geo-catalog.mjs` checks bounded queries, real acquisition dates, malformed JSON, rate-limit backoff, legitimate empty responses and metadata-only storage.
2. Source `source_status` should show recent `sentinel_catalog` and `aerial_archive` observations after scheduling or a single manually triggered smoke check.
3. Query `observations` for the new source labels and confirm timestamps refer to **collection time**, while payload `acquired_at` refers to **satellite/aerial acquisition time**.
4. Roll back to the previous Cloudflare Worker version if a new source causes unexpected errors; preserve all five existing bindings and minute cron.

