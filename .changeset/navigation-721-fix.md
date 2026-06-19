---
"@real-router/core": patch
---

Fix fire-and-forget unhandled rejection on `navigateToState()` and `navigateToDefault()` (#721)

Restore the documented fire-and-forget safety invariant for two navigation entry points that leaked an `unhandledRejection` when the returned promise was not awaited:

- `getPluginApi(router).navigateToState(state)` with a route no longer in the tree — the fresh `ROUTE_NOT_FOUND` rejection wrongly set the "skip suppression" flag reserved for pre-suppressed cached rejections, so the facade never attached its `.catch()`.
- `router.navigateToDefault()` with no `defaultRoute`, called after `router.start()` — the method did not reset the sync-resolution flag on entry, so it read the stale `true` left by `start()` and took the "already resolved" branch, skipping suppression.

Awaiting callers are unaffected: the rejection is still observable via `await`/`.catch()`.
