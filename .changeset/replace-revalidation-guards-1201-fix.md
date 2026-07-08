---
"@real-router/core": patch
---

`replace()` revalidation consults guards on a route-identity change (#1201)

`getRoutesApi(router).replace(...)` revalidates the active state against the new tree (#950). It committed whatever `matchPath(currentPath)` returned **without consulting guards** — so after a role-based `replace()` a user sitting on a URL that the new set maps to a different, `canActivate`-blocked route (or a `forwardTo` target) had that route silently activated with its guard skipped.

Revalidation is now hybrid:

- A **surviving** route (the URL still maps to the same route name) is kept without re-running guards — the user reached it via a real navigation, and `replace()` is not a navigation they performed (parity with `update()`, which never revalidates the active state).
- A **route-identity change** (an ownership reshuffle, or a newly-added `forwardTo` that teleports the state) runs the new route's activation guards exactly as `navigate` would: it commits on pass and routes to `navigateToNotFound(currentPath)` on a block — or on an async guard that cannot be evaluated synchronously.

The revalidation `TRANSITION_SUCCESS` now carries a distinguishable `revalidate: true` marker so a plugin's `onTransitionSuccess` can special-case a revalidation vs a real navigation (both otherwise carry only `replace: true`).
