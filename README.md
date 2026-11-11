# Regional Watch — public official-source collectors

This repository is a low-frequency, publicly auditable data collection layer feeding the separate Cloudflare regional-osint-monitor Worker and D1. Credentials remain on Cloudflare, never in GitHub.

| Collector | Official upstream | GitHub Actions cadence | Data |
|---|---|---|---|
| collect_centcom.py | [DVIDS U.S. Central Command Public Affairs unit 72](https://www.dvidshub.net/rss/unit/72) | Every 15 minutes | [News](data/centcom-news.json), [status](data/centcom-status.json) |
| collect_marad.py | [U.S. Maritime Administration](https://www.maritime.dot.gov/msci-advisories) | Every 6 hours | [Active maritime advisories](data/marad-advisories.json), [status](data/marad-status.json) |
| collect_satellite.py | [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/) + [NASA EONET](https://eonet.gsfc.nasa.gov/docs/v3) | Daily | [Satellite/natural-event metadata](data/satellite-observations.json), [status](data/satellite-status.json) |

## Aviation monitoring and limits

The separate Cloudflare Worker prioritizes **Tehran** ADS-B snapshots and samples a broad US–Europe–Middle East corridor at low frequency. A zero in one receiver snapshot is **not** proof of empty airspace, and corridor observations do **not** establish a specific military flight or route.

See [aviation coverage, source quality, quota allocation and UI states](docs/aviation-data-quality.md) for the exact sampling schedule, CC BY-NC attribution and rollback checks.

The [deployed Worker source snapshot](worker/regional-osint-monitor.js) is version-controlled and checked by [aviation regression tests](worker/test-aviation.mjs). **GitHub commits do not automatically deploy the Worker**; production changes require explicit Cloudflare deployment with the existing secret bindings and compatibility date preserved.

## Satellite quality and cost guardrails

- Daily checks sample three general areas: Persian Gulf, Strait of Hormuz and southern Red Sea.
- NOAA-20 GIBS imagery is sampled as one 256x256 center WMTS tile per area and requested date. The sample never represents full-area coverage.
- Six official map tile requests plus one natural-event request per scheduled day; failed/blank imagery stays missing rather than being fabricated.
- Images are NOT stored in GitHub. Metadata includes official URLs, geographic tile footprints, dates, content hashes and basic visual-difference diagnostics.
- Satellite image change is not evidence of attacks, equipment movements or infrastructure damage: clouds, dust, orbital/illumination effects and processing frequently explain pixel differences.
- EONET records environmental and natural events, not military incidents.
- Partial imagery and stale GitHub collector heartbeats are explicitly reported as incomplete.

## Source integrity

- Use only official public endpoints. No login workarounds, request-limit evasion or paid subscriptions.
- DVIDS feed is news-only, not complete CENTCOM press coverage.
- MARAD entries are currently active notices; first discovery is NOT their issue date.
- Clock timestamps for GitHub collection are not upstream publication timestamps.
- Scheduled GitHub Actions may be delayed. Cloudflare checks collector health separately from the data itself.
- No secrets are stored in this public repository.

[View workflow runs](../../actions)
