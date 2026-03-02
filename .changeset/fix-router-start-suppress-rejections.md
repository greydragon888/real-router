---
"@real-router/core": minor
---

Fix `Router.start()` to suppress unhandled rejections for fire-and-forget usage, matching `navigate()` and `navigateToDefault()` behavior. Calling `void router.start(path)` is now safe and will not produce `UnhandledPromiseRejectionWarning` for expected errors (`TRANSITION_CANCELLED`, `ROUTE_NOT_FOUND`). Fixes #211.
