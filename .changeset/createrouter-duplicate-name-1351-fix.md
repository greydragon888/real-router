---
"@real-router/core": patch
---

Reject duplicate names and reserved `@@` names in `createRouter([...])` initial routes (#1351)

The constructor / initial-routes path silently last-wins a duplicate-name sibling — dropping the first route, so its deep-link commits `UNKNOWN_ROUTE` — and accepts reserved `@@` route names, while `add()` / `replace()` already throw in bare core (#953 / #968 / #954). `createRoutesStore` now runs `assertNoInternalNamesInBatch` + `assertNoDuplicateNamesInBatch` before building, giving the constructor parity with the other two route-population entry points (duplicate paths are already rejected by the path-matcher backstop, #1153). Shipped as `patch` for parity with #953 / #968, which shipped this same silently-kept-last → throw change as a patch (it restores the intended uniqueness invariant, not a new feature).
