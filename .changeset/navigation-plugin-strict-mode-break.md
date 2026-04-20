---
"@real-router/navigation-plugin": minor
---

**BREAKING:** navigate event on unmatched URL in strict mode no longer silently redirects to `defaultRoute` (#483)

When `allowNotFound: false` and a navigate event targets a URL that matches no registered route, the plugin used to silently call `router.navigateToDefault()` inside `event.intercept`. This hid the error from logs, analytics, and the `onTransitionError` plugin hook.

**New behaviour:**

- `$$error` event is emitted with `ROUTE_NOT_FOUND` — reaches `Plugin.onTransitionError` hooks and `router.addEventListener("$$error", ...)` listeners.
- `event.intercept()` handler rejects, so the Navigation API automatically rolls back the URL (no manual `browser.navigate()` call needed).
- Router state is unchanged.

The `defaultRoute` option now has a single purpose: it is only consulted by an **explicit** `router.navigateToDefault()` call.

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
