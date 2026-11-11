# Regional news signals — GDELT, Europe Media Monitor, UCDP (11 Nov 2026)

Scope: Regional Watch backend only. No UI edits, no new paid provider, and no modifications to the user's Iran–US notification automation. Information found by news aggregators is **not independently verified** just because it is machine-classified or repeated across websites.

## GDELT Project — public Events 2.0 files

- Official dataset: https://www.gdeltproject.org/data.html ; latest files: https://data.gdeltproject.org/gdeltv2/lastupdate.txt
- 2026-11-11 live tests: Cloudflare and GitHub Actions both read the official latest-file manifest with **HTTP 200**, no key. GDELT DOC article-search API timed out from Cloudflare and returned **HTTP 429 from GitHub**; intentionally not included.
- Hourly GitHub Actions job: `.github/workflows/gdelt.yml`, running `scripts/collect_gdelt.py` and `scripts/test_gdelt.py`. Mirrors `data/gdelt-context.json` and `data/gdelt-status.json`.
- The Python job downloads at most 8 small 15-minute **Events 2.0** export ZIPs, decompresses using the standard library, limits memory, checks the latest published checksum, keeps only relevant broad region action-geocodes and conflict-related machine-classification roots, and publishes **aggregate counts plus at most 32 article URLs**.
- Cloudflare integration code under `worker/regional-osint-monitor.js`: `gdelt_context` collector scheduled at minute 55 hourly, after a GitHub job at minute 37. It imports source-attributed metadata, not full articles or a list of confirmed attacks.
- Historical gaps, staleness, missing data, 403/429 and unverified classification **must never be interpreted as no activity** or a confirmed military event.
- GDELT Project is **not** GDELT Cloud; avoid the latter's free plan, which disallows production/public display. Attribution: "Data: GDELT Project", https://www.gdeltproject.org/.

## Europe Media Monitor — awaiting supported machine interface

- Official project: https://knowledge-for-policy.ec.europa.eu/europe-media-monitor-emm_en and https://media-monitor.europa.eu/
- Public portal works. Older NewsBrief RSS `https://emm.newsbrief.eu/rss/rss?type=rtn&language=en&duplicates=false` returned **403** from both Cloudflare and GitHub Actions on 2026-11-11.
- The analogous URL at the new portal returned the **HTML application shell**, not XML/RSS.
- Do not scrape the public SPA, guess undocumented private APIs, or represent a 403 as an empty news feed.
- An authenticated, documented, permitted API or supported public RSS can be requested from **JRC-EMM-INFO@ec.europa.eu**. This source is **not enabled**.

## Uppsala Conflict Data Program — API token needed

- Official API documentation: https://ucdp.uu.se/apidocs/index.html
- API is free after obtaining a token from **mertcan.yilmaz@pcr.uu.se**. Documentation says expected review 3–5 business days; daily quota 5,000 requests, including errors.
- Anonymous Cloudflare test returned **401** with explicit requirement for `x-ucdp-access-token` header.
- A token request should describe Regional Watch as a non-commercial independent public-source regional monitoring/research project. Do not claim institutional affiliation.
- Token must be a Cloudflare secret binding or GitHub Actions secret (never git, D1 logs, or a client-visible API).
- UCDP GED is geographically coded conflict-event history and candidate releases, **not** a validated live conflict warning. Use as historical context, with publication date, source, and release version included in records.
- Source **not enabled pending token**.

## Verification gate

- Check the GitHub Action `GDELT public regional news context` completes and writes valid `data/gdelt-context.json` and `data/gdelt-status.json`, with realistic non-stale timestamps.
- Check Worker CI `worker/test-gdelt.mjs` succeeds.
- Only after these checks should the Worker version containing `gdelt_context` be deployed to production; preserve prior Cloudflare Worker version for rollback.
- For EMM and UCDP, no automated collection until the access conditions above are satisfied.
