---
"@real-router/browser-plugin": minor
---

**BREAKING:** popstate to unmatched URL in strict mode no longer silently redirects to `defaultRoute` (#483)

When `allowNotFound: false` and a popstate event targets a URL that matches no registered route, the plugin used to silently call `router.navigateToDefault({ reload: true, replace: true })`. This hid the error from logs, analytics, and the `onTransitionError` plugin hook, and overloaded `defaultRoute` with two unrelated meanings (explicit target + implicit auto-fallback).

**New behaviour:**

- `$$error` event is emitted with `ROUTE_NOT_FOUND` — reaches `Plugin.onTransitionError` hooks and `router.addEventListener("$$error", ...)` listeners.
- Browser URL is rolled back to the last-known router state (URL↔state consistency preserved).
- Router state is unchanged.

The `defaultRoute` option now has a single purpose: it is only consulted by an **explicit** `router.navigateToDefault()` call.

**Incidental fix:** the same catch now rolls back URL on any `RouterError` (including guard-rejected navigations). Previously, a `canDeactivate: false` on popstate left the browser URL on the new location while router state stayed on the old — an inconsistent observable state that is now resolved.

**Migration** — if you relied on the silent fallback:

```ts
router.usePlugin(() => ({
  onTransitionError(_toState, _fromState, err) {
    if (err.code === "ROUTE_NOT_FOUND") {
      void router.navigateToDefault({ replace: true });
    }
  },
}));
```
