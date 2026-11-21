# DEV-OSS-02 — isolated parsers/language probes

**Scope:** read-only candidate experiments. This directory and workflow never deploy to Cloudflare or alter active pipelines. Run on PR via `.github/workflows/dev-oss-02-trials.yml` with no credentials.

- `baseline.test.mjs` imports the exact current `centcom-rss.js` source text and executes it with injected offline `get()`; source remains unchanged. Test establishes existing gaps (namespace prefix, encoded entities) and preserved restrictions (origin URL).
- `candidate.test.mjs` defines the expected target behavior for a **test-only** `fast-xml-parser@5.12.1` adapter with fail-closed malformed/DTD/oversize responses.
- `probes.mjs` compares the built-in script heuristic with `franc-min` on RU/HE/EN/AR and mixed text; checks `Intl.Segmenter`, native URL canonicalization, and Cheerio + Mozilla Readability on representative **synthetic** HTML. Result isn't license clearance or production language accuracy.
- Bundling with esbuild tests browser-compatible module compilation, **not** the existing concat-based production Monitor build or Cloudflare Workers Free CPU.

**Decision gate:** Do not merge candidate into Monitor on this evidence alone. Need at least one allowed captured live CENTCOM XML fixture, Cloudflare CPU measurement, preservation of build contracts, full CI, rollback plan, and no paid resource. HTML extraction may only be used when source rights, ToS, and sanitization are addressed. Preserve Cloudflare AI for translations.
