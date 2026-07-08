---
"@real-router/core": patch
---

`replace()` revalidation preserves a surviving route's `state.context` (#1236)

When `getRoutesApi(router).replace(...)` revalidates the active state and the route **survives** (same name + path), it rebuilt the state from `matchPath` with a fresh, empty `context` — silently dropping every value plugins wrote into `state.context.<namespace>` (SSR data, rsc, navigation, any `claimContextNamespace` consumer). Revalidation runs neither the loader nor the `start` interceptor, so the data did not come back on its own. The surviving route's prior `context` is now carried over, symmetric with the `transition` carry-over already in place.
