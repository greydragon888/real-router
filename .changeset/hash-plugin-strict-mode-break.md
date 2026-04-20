---
"@real-router/hash-plugin": minor
---

**BREAKING:** popstate to unmatched hash in strict mode no longer silently redirects to `defaultRoute` (#483)

Same change as `@real-router/browser-plugin` — hash-plugin reuses the shared `popstate-handler` from `browser-env`, so the fix propagates automatically.

When `allowNotFound: false` and a popstate targets a hash that matches no registered route, the plugin used to silently call `router.navigateToDefault({ reload: true, replace: true })`. This is removed.

**New behaviour:**

- `$$error` event with `ROUTE_NOT_FOUND` — observable via `onTransitionError` hook.
- Browser URL is rolled back to the last-known router state.
- Router state is unchanged.

**Migration** — same as browser-plugin:

```ts
router.usePlugin(() => ({
  onTransitionError(_toState, _fromState, err) {
    if (err.code === "ROUTE_NOT_FOUND") {
      void router.navigateToDefault({ replace: true });
    }
  },
}));
```
