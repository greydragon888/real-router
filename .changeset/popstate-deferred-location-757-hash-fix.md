---
"@real-router/hash-plugin": patch
---

Fix a deferred null-state popstate landing on the wrong route after a concurrent navigation (#757)

When a back/forward event was deferred behind an in-flight async-guarded navigation and that event carried a `null`/invalid `history.state`, the shared popstate handler resolved its route via `matchPath(browser.getLocation())` at replay time — after the in-flight navigation's `onTransitionSuccess → replaceState` had already overwritten the live hash location. The router landed on the earlier target instead of the entry the user actually navigated to, and the visible URL desynced.

The handler now snapshots the location the instant each popstate event fires and resolves the deferred event against that snapshot, so the last back/forward entry wins. The same snapshot also feeds the `navigateToNotFound` and strict-mode `ROUTE_NOT_FOUND` paths.
