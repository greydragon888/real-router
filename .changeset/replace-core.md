---
"@real-router/core": minor
---

Add `routesApi.replace()` for atomic route replacement (#195)

Combines `clear + add` into a single operation with one tree rebuild, state preservation via `matchPath` revalidation, and selective guard cleanup (`isFromDefinition` tracking). Designed for HMR use cases.
