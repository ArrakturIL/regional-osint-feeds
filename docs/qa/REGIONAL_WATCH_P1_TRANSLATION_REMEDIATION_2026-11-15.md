# Regional Watch — source-verified P1 RU/HE remediation gate (15 Nov 2026)

**Status: REVIEW CANDIDATES ONLY. NOT A PRODUCTION DATA PATCH.**  
**Source manifest:** `data/qa/p1-translation-remediation-20261115.json`.  
**Isolated branch:** `work/regional-watch-execution-20261115`, draft PR #25.  
**QA:** `tests/architecture/news-localization-provenance.test.mjs` and `tests/architecture/translation-semantics.test.mjs`.

## Why a data correction is still required
The published D1 `regional-watch-news` contains actual mistranslations even after the new feature code was fixed. A successful semantic-guard unit test does **not** repair a stored RU title or a previously approved HE cache. At feature deployment the guard should fail-closed into `needs_review`, but that still requires browser/API verification.

## Source-verified candidates
| News ID | Primary report | Required meaning; no claim inflation |
|---|---|---|
| `67d535234b8e4179f9401a71` | [Israel National News, 14 Nov](https://www.israelnationalnews.com/news/436187) | Iranian Navy **claimed** two tankers caught fire after hitting a **naval mine** east of Hormuz. Article says no independent verification. No «танкеры атаковали», «обстреляны» or mining facility `מכרה`. |
| `da4c4535478a60f9b3975e40` | [Reuters republished by Jerusalem Post](https://www.jpost.com/middle-east/iran-news/article-914862) | According to sources Trump **may** withhold future US strikes **on Iran** **if** there are no new provocations. The action is undecided. Not Iran attacking the USA, and not a ban on provocations. |
| `9fc41a45cd3dde0e911c3773` | [Jerusalem Post analysis](https://www.jpost.com/middle-east/iran-news/article-914880) | Israel fears a **surprise US strike on Iran** without adequate warning. Israel is not planning to surprise the USA. Original remains analytical reporting, not official confirmation of an attack. |

The manifest preserves original source URLs, exact original English title/summary, exact known-bad RU/HE cache examples (where confirmed), proposed accurate RU/HE short paraphrases and `review_only_not_deployed` state. CI checks language meaning and deliberately known-bad strings; this is a **necessary but not sufficient** editorial quality check.

## Controlled deployment prerequisite — NOT YET APPROVED
1. Take an immutable Time Travel/bookmark backup of `regional-watch-news`. Export D1 backups for the three original `news_items` rows and `regional_i18n` Hebrew rows, including every metadata column, before any write. Verify the backup can be read back. Do **not** store tokens or full private D1 exports in public Git.
2. Query each target row afresh and match **all** `id`, `url`, original English `headline`/`summary`, old RU fields and HE `source_hash` from this manifest/preflight. Abort if an upstream collector has updated any of them; never overwrite newer data.
3. Quarantine the three existing HE rows into the **already existing** `regional_i18n_quarantine` table with a machine-readable reason. Verify full copy and hash *before* deleting/invalidating live HE cache. No mass deletion or automatic 85+ `available` for reviewed-only candidates.
4. Update only the two confirmed corrupt Russian records; the third RU record is already semantically correct and needs no forced rewrite. Preserve `news_items.id`, original English source, priority, source URL, publish timestamp, source lineage, and event IDs. Do not rewrite `news_event_groups` or forcibly merge unrelated incidents.
5. Existing `eventRows` joins `news_items` and HE `regional_i18n`, and `localizeNewsRow` examines RU originals and HE source hashes. On the feature build the stale HE cache must be marked pending/needs_review until editorially approved fresh HE text and fingerprint are installed.
6. Before declaring success: re-run RSS import / next Editor cron in isolated QA so bad RU fields do not silently reappear; then compare both RU/HE API output for the exact event/article IDs, source URLs, attribution, title/summary, `translation_status`, `field_translation_status` and true source languages. Test the visible home, archive and detail pages at narrow and desktop widths.
7. Only after full QA may an authorized deployment repopulate HE translations from these **reviewed** candidates with the matching current source fingerprint (which is based on `[RU title,RU body,comment]`). Never copy an obsolete HE `source_hash` into a new translation; stale hashes must not be treated as ready.

## Rollback if a later approved deployment fails
- Restore only the three affected `news_items` RU fields and any corresponding `regional_i18n` HE rows **from the verified preflight backup**, not guessed values from a newer source.
- Restore previous `regional_i18n_quarantine` status as appropriate (do not destroy audit history); record rollbacks, reason, operation timestamp and affected IDs.
- Restore previous pinned Worker version **only if** the tested rollback is needed, without changing unrelated bindings or D1 schema.
- Rerun event/API tests; a matching title is insufficient if content language, source/translation status or provenance is wrong.

**Production status as of this doc:** original three D1 cache defects still present; no migration, delete, update, or deployment executed by this session. Source evidence based on primary publisher pages and read-only D1 SELECT. Next dependent task: reviewer approval, migration with verified backup and release-gated E2E, then one source at a time for Neon→D1.
