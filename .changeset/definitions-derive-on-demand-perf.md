---
"@real-router/core": patch
---

Derive route definitions from the tree on demand — drop the third retained copy of the route table (#1426)

`RoutesStore.definitions` is now a getter over `routeTreeToDefinitions(store.tree)` (the lossless inverse `cloneRouter` already relies on) instead of a permanently-retained parallel array. Browser CDP A/B on the 10k-route table: **−0.229 MB (−3.6 %) retained heap** — cumulatively −30 % with #1379/#1414/#1415. The derived array is a fresh snapshot per access (cold CRUD/plugin-registration paths only); behavior is unchanged and the internals surface consumed by `@real-router/validation-plugin` is preserved.
