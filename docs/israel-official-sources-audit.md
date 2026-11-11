# Israel official aviation and maritime sources — integration audit (2026-11-11)

This note describes **backend collection feasibility** only. The existing production Worker, its D1 database, and all cron schedules remain unchanged by this audit.

## Israeli maritime notices

**Official register:** Israel Administration of Shipping and Ports (ASP), [Notices to Mariners](https://www.gov.il/en/Departments/DynamicCollectors/notice-to-mariners?skip=0).

This register publishes real navigational warnings and Israeli Navy area closures, including a 2026 notice about a dangerous navigation area ([Notice 067/2026](https://www.gov.il/en/pages/67-2026)) and longer-running small-craft closures ([Notice 112/2026](https://www.gov.il/he/pages/112-2026)). Distinguish the *date a page was published* from the actual start/end times of restrictions. A notice may be expired, amended or cancelled.

**Cloudflare result:** A single temporary Worker attempted a public GET of the register on 2026-11-11 and received **HTTP 403**, with HTML titled **“Attention Required! | Cloudflare”**. The temporary Worker was deleted. This confirms direct access from that Cloudflare runtime was challenged, not that the original official publication lacks data.

**Status:** Not enabled. No background retries, bot protection bypass, proxy rotation, or invented unofficial endpoint. Obtain an authorized machine-readable source (public RSS/JSON confirmed to cover this collection, or explicit publisher permission) before adding a collector.

## Israel NOTAM versus eAIP

- **Official eAIP:** https://e-aip.azurefd.net/ — a public Cloudflare Worker probe returned HTTP 200 and the page title “eAIP Israel”.
- **What it is:** Published aeronautical information / AIRAC amendment documents, **not** a near-real-time NOTAM feed.
- **NOTAM authority:** Israel's AIP section [GEN 3.1](https://e-aip.azurefd.net/2026-08-06-AIRAC/html/eAIP/LL-GEN-3.1-en-GB.html) describes Israel NOTAM series A and C and the IAA AIS Office. It points to the IAA aeronautical information website for NOTAM, but a stable, freely available machine-readable feed and collection terms have not been verified.
- **Status:** No automated NOTAM ingestion. Do not treat eAIP issue dates or general airport announcements as operational NOTAM, and never treat an inability to fetch as “no restrictions”.

## Current coverage and next-safe integration conditions

The backend already has EASA, MSCIO/UKMTO, MARAD and other non-Israeli regional or official sources, plus IDF public releases. These **do not replace** Israel's own NOTAM and local navigational notices.

For a new collector: (1) first verify source access and publishing rights using its legitimate public interface, (2) persist canonical URL, official publication date, restriction validity interval, and amendment/cancellation status where explicitly present, (3) distinguish *newly collected* from *newly published*, (4) report unavailable/partial rather than falsely claiming no notices, and (5) enforce a modest provider-specific quota and a 24-hour or more frequent polling interval appropriate to the source's release cadence.

**No production source was added** because access and freshness cannot yet be validated.
