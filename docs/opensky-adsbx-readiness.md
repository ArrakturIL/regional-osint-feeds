# OpenSky and ADS-B Exchange: integration readiness (2026-11-11)

**Status:** adapters and tests are in GitHub. **Neither provider is enabled in the production Cloudflare Worker**. Existing `adsb`, `adsb_alt` and `airbridge_context` schedules, D1 records, provider quotas and Pages site remain unchanged.

AirLabs is deferred because registration is on a waitlist. Aviationstack is deferred because 100 monthly requests and civil flight-status emphasis do not justify another live collector.

## OpenSky — live connectivity check

Official docs: https://openskynetwork.github.io/opensky-api/rest.html

- Supports `GET /api/states/all` with `lamin,lomin,lamax,lomax` bounding box.
- Anonymous allowance: 400 **state credits/day**, IP-based; a bounding box of up to 25 square degrees costs 1 credit. Authenticated standard accounts: 4,000 state credits/day. Authentication uses **OAuth2 client credentials**, not the old username/password.
- Tehran 100 NM bounding box is approximately 14 square degrees; the request adapter calculates the exact bounds and filters the returned state vectors to the actual 100 NM circle.
- **One controlled test from a temporary Cloudflare Worker on 2026-11-11 returned a 10-second fetch timeout**, not a valid OpenSky response. The test Worker was deleted. This does **not** establish whether the cause is a permanent block, transient network failure, or another issue. A separate tool-side request returned an access-control 403 from that tool's outbound proxy, which must not be attributed to OpenSky itself.
- The OpenSky site warns that major cloud providers may be blocked. **Do not** schedule repeated Cloudflare probes, rotate egress, proxy through other accounts, or claim an empty sky when the API is inaccessible.
- No live OpenSky source has been activated. A future one-shot test requires an approved and reachable egress path; only then consider low-frequency Tehran observations with a separate D1 lease/backoff and strict daily credit budget.

## ADS-B Exchange — entitlement required

Official OpenAPI specification: https://gateway.adsbexchange.com/api/aircraft/v2/docs/openapi.json

- The `GET /lat/{lat}/lon/{lon}/dist/{dist}` endpoint accepts a radius in nautical miles. The OpenAPI security requirement is `X-Api-Key`; it also documents `Accept-Encoding: gzip`.
- HTTP 402, 403 and 429 are explicit responses. **RPM rate limits do not grant a free subscription or entitlement.** The provider's access tier and redistribution rights must be confirmed before enabling a public dashboard.
- Current production Worker bindings do **not** contain an ADS-B Exchange API key. The adapter rejects a missing key **before making any network request**. No credentials have been created, exposed or stored in GitHub.
- The parser accepts only fresh, geolocated aircraft inside the requested radius, aggregates counts and type/database hints, and discards individual identifiers. It never labels a database military flag as proof of an operational US military flight.
- Enable only after a valid, explicitly authorized API key is stored as a Cloudflare **secret** binding, license/redistribution terms are checked, and the provider's actual account quota is known. Do not commit the key to source or tests.

## Code and tests

- `worker/aviation-providers.mjs`: builds validated requests; parses and aggregates OpenSky state vectors and ADS-B Exchange aircraft arrays; rejects stale/malformed snapshots; compares overlapping independent samples without declaring empty airspace.
- `worker/aviation-provider-collectors.mjs`: opt-in single-request fetch functions, explicit error handling for 402/403/429, optional OAuth2 bearer token input and required ADS-B Exchange key.
- `worker/test-provider-adapters.mjs` and `worker/test-provider-collectors.mjs`: offline fixtures for zero vs unavailable, freshness, deduplication, military-type hints, cross-source disagreements, key gating and 429.
- `.github/workflows/worker-check.yml`: validates the deployed Worker snapshot syntax and runs all three aviation test suites on changes. These tests **do not** contact the external providers.
- These new modules are **not imported by** `worker/regional-osint-monitor.js`; they cannot silently add API calls or alter production quotas.

## Acceptance criteria before activation

1. **Access:** OpenSky returns a valid JSON response from the intended authorized runtime, or is left disabled. ADS-B Exchange accepts an entitled key; no unauthorized probes.
2. **Quotas:** Explicit, separately leased budgets and provider-specific Retry-After/backoff. Never share AvioADSB's daily allowance with these providers.
3. **Freshness:** Valid successful empty `states: []` or `ac: []` may produce `zero_in_sample`. Null arrays, stale timestamps, 403, 429 and timeouts produce **no sample** and never refresh `succeeded_at`.
4. **Cross-check:** Compare only overlapping time windows and the same geographic area. Contradictions become `source_disagreement`; two zeroes remain **unverified receiver coverage**, not empty Iranian airspace.
5. **Attribution and rights:** Cite OpenSky's research paper for public output; confirm ADS-B Exchange redistribution permission for the chosen plan before displaying its data.
6. **Deploy:** Back up Worker; compile staging; preserve compatibility date, cron, D1 and secret bindings; verify first real observation; roll back if anything fails.

**No code changes to the production Worker were made in this phase.**
