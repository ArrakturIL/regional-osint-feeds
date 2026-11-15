# Regional Watch CSS modularization and typographic audit (2026-11-15)

## Context and decision
Frontend JavaScript was modularized earlier, while all CSS stayed in a single 57 KB authored `frontend/src/styles/app.css` for exact production parity. This step moves the authored rules to page/component-owned stylesheets while preserving the **exact original rule order and output bytes** as a regression baseline. `frontend/scripts/build-styles.mjs` concatenates a deterministic `frontend/styles-order.json`, then adds one deliberate design-adjustments sheet `src/styles/refinements.css`. Browser still receives one CSS bundle.

## QA basis
Latest QA found an inconsistent rhythm: "What changed" → "Featured stories" around 28 px in RU vs 60 px HE; "Featured stories" → "On air" had 0 px RU in an earlier build. Subsequent QA reportedly improved these but left RU/HE around 28/60. We now enforce locale-neutral `#overview` spacing rules and explicit border/padding at these transitions. Keep source content, layout order, routes and backend contracts unchanged.

## Palette and typography
Existing dark-green background `#0b1412`, primary `#eaf5ee`, and green accent `#83e7ad` are already high-contrast. On page / solid panel, accent yields ~12.5 / ~11:1; muted `#86aa94` yields ~7.3 / ~6.4:1. The problem is mainly 10–12 px metadata and inconsistent spacing, not the base hues. A warmer less-desaturated muted text token `#bcd4c3` yields ~11.9:1 on page and ~10.5:1 on panel. Keep system fonts and local Hebrew fallback; do not load paid fonts.
- WCAG 2.2 AA minimum 4.5:1 ordinary text and 3:1 large text: https://www.w3.org/TR/WCAG22/
- USWDS body text readability, line measure and line height: https://designsystem.digital.gov/components/typography/
- Test both languages at narrow and wide viewports. Avoid assuming browser visual parity from unit tests.

## Guardrails and release
No production promotion. Changes deploy only through `rw-modular-preview`. The QA suite checks original CSS source-byte parity before deliberate additions, the concatenated final bundle, source-file topology, color contrast, and new spacing selectors. Preview shares underlying databases with production: only read-only UI/API smoke.

## HTML shell CSS de-duplication
The eight frozen RU/HE HTML templates all contained precisely the same 3,365-character `<style id="rw-editor-bottom-v16">` block. Those rules have been moved exactly to `frontend/src/styles/document-shell.css` and appended to the generated `/assets/app.css` **after** design refinements to retain their original cascade priority (original load order: `app.css`, then inline style). All eight templates now reference only the common stylesheet; document structural markup and scripts remain unchanged. `frontend/tests/styles.test.mjs` checks this property and source-byte equality of the extracted block.
