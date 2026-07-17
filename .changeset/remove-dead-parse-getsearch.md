---
"@real-router/core": patch
---

Internal: remove dead `parse`/`getSearch` and phantom grammar re-exports from the routing engine (#1505)

`search-params.parse` (a path-accepting wrapper orphaned by #1292, when `createMatcher` moved to `parseQuery`) and `getSearch` (its only consumer) had no runtime caller; `path-matcher`'s `PARAM_NAME_PATTERN` / `CONSTRAINT_BODY_PATTERN` stayed defined as internal grammar atoms but their package-index re-exports had none. Removed the dead code and migrated the affected tests to `parseQuery` — 100% coverage and mutation score preserved. Pre-step of the engine-merge (A.0). No public API or behavior change: the internal trio bundles into `@real-router/core`.
