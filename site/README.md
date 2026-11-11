# REGIONAL WATCH — frontend deployment notes

The Cloudflare Pages project `regional-watch` currently uses **Direct Upload**, not GitHub-triggered builds. Pushing to `main` **does not** deploy the frontend automatically.

## Source of the active UI overlay

- `regional-watch-ui-overlay-v2.js` — current production Pages advanced-mode `_worker.js` source; deployed separately to Cloudflare.
- `regional-watch-ui-hotfix-20261111.js` — V1 rollback/reference copy.
- Immutable base site: `https://f5a75117.regional-watch.pages.dev` (contains the existing UI, Pages API and D1 bindings).

The overlay proxies every unchanged request to the immutable base, rewriting only `/api/news`, `/assets/app.css`, and `/assets/app.js`, and handling `/api/satellite-preview`.

**Do not remove or overwrite the immutable base** until the original HTML, CSS, JavaScript and Pages Functions are all saved and built from source. It is a dependency, not a long-term architecture. The new analyst page remains on hold until backend V1.1 is ready.

## Preserved fixes

1. Editorial text filter in `/api/news`: title-level filtering, not publisher-level blocking; D1 remains unchanged.
2. MARAD/CENTCOM card alignment in CSS.
3. Sentinel-2 preview JPEG link and separate JSON metadata link.

## V2 importance badges

News cards read the existing `/api/news` `priority` field, not an inferred security threat level:

| Condition | Label | Color |
| --- | --- | --- |
| Explicit `severity/riskLevel/urgency=critical/emergency/imminent` **and** `verified/confirmed=true` or `confidence=confirmed` | Критично | Red |
| `priority >= 9` | Высокий приоритет | Amber |
| `priority >= 7` | Средний приоритет | Light blue |
| Other/unknown | Обычное | Muted green |

The critical badge never results from a high editorial priority alone. No changes are made to the backend, news text, or source ranking. The optional client decorator must never break primary news rendering if its own fetch fails. Labels refresh every five minutes while the page is visible.

## Deploy and rollback

Publish the **contents of V2** as a Pages advanced-mode `_worker.js` using the Cloudflare Pages Direct Upload API with an empty static-file manifest and `branch=main`. Test first on a preview branch. Deployments should reference the matching GitHub commit for traceability.

A rollback can select an earlier successful Pages deployment; V1 source is retained here. A missing legacy satellite JS replacement string must never crash `/assets/app.js` with 503.

## Known technical debt

The underlying HTML/JS/CSS and Pages Functions still need to be brought into this repository. Then replace response-text patching and the DOM observer with a source-level component and a proper build/test pipeline. Until that migration, keep the proxy minimal and preserve the base deployment.
