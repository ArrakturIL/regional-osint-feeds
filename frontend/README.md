# Regional Watch frontend — modular source layout

The source of the existing production frontend is split into **45 functions** in dedicated modules under components/, pages/, hooks/, api/, utils/, i18n/, app/ and legacy/. No application behavior changes in this migration. Both languages still use a single App component.
The no-dependency compatibility builder in scripts/build.mjs assembles the current app.js from 50 source modules in their frozen execution order. The output must be byte-identical to the Cloudflare Pages baseline (82,241 JS characters and 57,404 CSS characters). See source-parity.test.mjs.
This is NOT yet a standalone Pages deployment. The previous Pages server-side _worker.js was not available for exact extraction; API routes must be reconstructed and verified in a separate PR before any deployment. Existing CSS remains in src/styles/app.css until an independently tested CSS split. Source files with legacy/ are deliberately retained until proven unused.
Do not deploy dist/ to production before the server runtime, bindings, RU/HE parity and complete API contract suite are independently verified.
