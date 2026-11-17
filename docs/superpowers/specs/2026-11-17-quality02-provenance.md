# QUALITY-02 — provenance and comparison coverage (17 Nov 2026)

Goal: one combined backend-only PR for two remaining priority gaps: C-04 monitor comparison content and B-03 partial news translation/original provenance.

Observed production baseline: `/api/changes?lang=ru` returns `sourceComparable=0`, `sourceUpdates=0` even when journal entries exist, and lacks a machine-readable explanation of incomparable sources. Current `/api/news` already returns `source_language` but does not expose the original article's title/summary/hash or per-field rendered translation status.

Approaches: (a) frontend text-only hacks — rejected, no trustworthy comparison data; (b) new DB tables/ML pipeline — rejected, budget and migration risk; (c) add bounded, factual, read-only fields to existing Editor DTOs (chosen), with no schema or UI changes. Keep existing response keys, paging, and ordering unchanged.

Scope: compare valid nonzero per-source timestamps in the two most recent completed monitor runs; reveal advanced sources and coverage gaps without claiming independently verified incidents. On news cards, expose immutable original title/summary, a deterministic SHA-256 source hash of original fields, and headline/summary display translation states. Preserve script-sensitive original-vs-translated labeling, Hebrew alternatives, all existing localization controls.

Constraints: no extra AI, D1/Neon writes, cron, paid services, new Workers, new dependency, or legacy changes. Source tests RED then GREEN, integrated CI and immutable release dry-runs. PR only until separate release authorization. C-04/B-03 remain partial at full product scope; UI and other article types handled later.