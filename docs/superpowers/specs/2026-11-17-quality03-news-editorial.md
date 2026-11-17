# QUALITY-03 — trustworthy source grouping and field-level editorial localization (17 Nov 2026)

## Grounded problem

Read-only production D1 on 17 Nov reveals three falsifiable grouping defects:
- Jordan's blocking of a messaging service on national-security grounds (Al Jazeera + Times of Israel) is grouped under `topic=strike`, because a church attack is merely historical **background** in the RSS summaries; Times of Israel's reporting claim is also incorrectly `reported_death`.
- Two reproductions of an **opinion** about an Iran negotiating table (JNS URL `/opinion/...` and Arutz Sheva summary ending `Opinion.`) appear as candidate breaking news.
- Distinct political speakers, Golan versus Liberman's party, became one election group merely because both refer to Netanyahu and coalition politics.

All are public-source examples already in live D1. Preserve source links, legitimate two-outlet grouping (including Netanyahu's Europe warning), and no arbitrary per-outlet special-case.

## Chosen approach

Narrow classifier/claim-identity guards in current `backend/editor/src/news/` plus B-04 additive, field-level diagnostic metadata for editorial notes. Keep original text/raw source intact. Do not change event storage schema, cron, AI prompts, frontend, or existing time/order contract. The text/topic filters must be generic action/phrase rules, not a fixed list of URLs, people or article IDs.

Specifically:
- Recognize an administrative platform ban/technical service restriction **from a headline**, independently of historical attacks in the summary.
- Hold clearly signposted opinion posts found via a generic /opinion/ path or trailing 'Opinion.' summary marker. A normal news report quoting someone's 'opinion' within its summary remains news.
- Avoid merging two independently attributed political decisions with different explicit headline actors; retain matches where the same actor is cited or speaker is unknown.
- A past death described as context to a non-fatal headline is **not** a death assertion about the headline event; explicit military nonconfirmation still remains attributed.
- Editorial RU/HE API can identify which fields are usable in target locale and name exactly which field prevents overall completeness, without pretending untranslated `verified_note` is translated or invalidating HE cache/source hashes.

## Acceptance and boundaries

TDD RED→GREEN on real-source regression records and Editor localized reader. Mandatory CI end-to-end immutable build/dry-run; PR only before controlled release. This is **partial** C-02/C-03/B-04: classification won't certify the claims or replace global editorial/content QA. Existing indexed events require next scheduled reconciler to materialize newly classified event groups (do not write D1 from test).