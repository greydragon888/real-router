---
"@real-router/core": patch
---

Fix stale `areStatesEqual` / `isActiveRoute` after route-tree mutations (#723)

The per-route-name URL-param cache that backs `areStatesEqual()` and `isActiveRoute()` was invalidated only on `dispose()`, so a route-tree mutation that changed a route's param shape (e.g. `getRoutesApi(router).replace(...)` turning `/item/:id` into `/item/:id/:tab`) left both comparisons frozen to the pre-mutation shape.

The cache now lives at the routes layer (next to `getUrlParams`, where it is derived from the matcher) and is cleared on every matcher rebuild — covering `add` / `remove` / `replace` / `clear` through both the in-place rebuild and the prepare-then-commit (`replace`) paths. This keeps the comparisons in lock-step with the current tree without subscribing to `TREE_CHANGED` (which would defeat the listener-gated diff optimization).
