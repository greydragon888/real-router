---
"@real-router/angular": patch
---

Route `injectIsActiveRoute` through the shared `createActiveSource` fast/slow builder (#1437)

`injectIsActiveRoute` called `createActiveRouteSource` directly, so a default-options call always took the slow per-`(router, name)` cached source with its own router subscription — instead of the shared per-router `createActiveNameSelector` fast path the directives (`RealLink`, `RealLinkActive`) already use. Routing it through `createActiveSource` gives the fast path (one shared subscription for any number of distinct-name consumers); the active-state result is identical. Also removes the now-unused `internal/buildActiveRouteOptions.ts`. (#1437)
