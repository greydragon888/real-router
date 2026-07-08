---
"@real-router/core": patch
---

Clear interceptors on `dispose()` so a leaked interceptor no longer runs (#1199)

`dispose()` had dispose safety-nets for `routerExtensions` and `contextClaimRecords` but never cleared `ctx.interceptors` — the third per-plugin registration channel. Since `buildPath` is not method-swapped by `dispose()` and reads the interceptor Map live, an interceptor a plugin failed to remove in `teardown` still ran on the disposed router. `dispose()` now clears the interceptor Map alongside the other two safety-nets.
