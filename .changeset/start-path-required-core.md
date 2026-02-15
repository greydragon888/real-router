---
"@real-router/core": minor
---

Make `path` a required argument in `router.start()`.

BREAKING CHANGE: `router.start()` now requires a path string argument.
Use `router.start("/path")` instead of `router.start()`.
Browser plugin users are unaffected — the plugin injects browser location automatically.
