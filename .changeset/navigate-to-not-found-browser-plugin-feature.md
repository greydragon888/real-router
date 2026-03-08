---
"@real-router/browser-plugin": minor
---

Use `navigateToNotFound()` on popstate when `allowNotFound` is enabled (#241)

When `allowNotFound: true` and a popstate event resolves to an unknown route, the plugin now calls `router.navigateToNotFound()` instead of `router.navigateToDefault()`, preserving the unmatched URL for contextual 404 pages.
