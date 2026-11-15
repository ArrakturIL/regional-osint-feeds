# Regional Watch Monitor — module layout (frozen v47)
43 focused source files grouped by `collectors/aviation`, `maritime`, `official`, `satellite`, `markets`, `network`, `api`, `storage`, `schedule`, `config` and `utils`.

The compatibility build uses no new dependencies and assembles the exact original 103,561-character Cloudflare Monitor v47 Worker from these modules. It does **not** deploy them, change data, or alter cron behavior. CI compares the resulting bundle byte-for-byte to the frozen production source and runs syntax/import checks.

**Do not deploy** this directory yet: production `wrangler` bindings and a self-contained Worker release must be separately validated, along with collector tests and scheduled execution. The `main` branch and existing GitHub collectors are untouched.
