---
"@real-router/navigation-plugin": minor
---

Fix canDeactivate guard contract on browser back/forward (#524)

Two related defects made `canDeactivate` guards effectively unusable under `@real-router/navigation-plugin` for the documented "confirm-on-back" dirty-form pattern:

**A. `forceDeactivate` default flipped from `true` → `false`.**
Previously every browser back/forward silently bypassed `canDeactivate` guards. The same user code that works under `@real-router/browser-plugin` stopped working under `navigation-plugin` with no visible signal. New default respects guards; apps that need the old bypass behaviour opt in explicitly via `navigationPluginFactory({ forceDeactivate: true })`. Pre-1.0, so this ships as a minor bump; migration is a one-line opt-in.

**B. `withRecovery` now explicitly syncs URL back on `RouterError`.**
`navigate-handler.ts` used to silently swallow `RouterError` thrown from `router.navigate()` (`CANNOT_DEACTIVATE`, `CANNOT_ACTIVATE`, `SAME_STATES`, etc.). The intercept handler then returned a resolved promise, and the Navigation API committed the URL change even though the router had rejected the transition — leaving URL and router state desynchronized.

Now, when `router.navigate()` rejects with `RouterError`, the plugin calls `syncUrlToRouterState` — `browser.navigate({ history: "replace" })` to the current router state — so URL and state stay consistent. `finished` resolves (URL is valid, just back at the previous state); observers that need the rejection get it through the router's existing `TRANSITION_ERROR` / `TRANSITION_CANCEL` events. Manual sync is used instead of relying on Navigation API's built-in rollback on intercept rejection, which leaves a visible "committed-then-reverted" URL window in Chromium headless and some cross-origin setups.

Non-`RouterError` exceptions still go through the pre-existing `recoverFromNavigateError` path (now refactored to call the same `syncUrlToRouterState` helper + log a critical-error line).

Four new regression tests under "canDeactivate guard contract — #524" in `tests/functional/navigate.test.ts` pin the combined contract:

- `forceDeactivate default is false (respect guards)`
- `browser-initiated navigate triggers canDeactivate guard by default`
- `guard rejection syncs URL back and leaves router state unchanged`
- `explicit forceDeactivate: true still bypasses guards (opt-in escape hatch)`

Two existing tests that assumed the old behaviour are updated:

- `does NOT recover on RouterError (expected behavior)` — clarifies that the crash-recovery logging path stays quiet for `RouterError`; `finished` resolves normally after manual sync.
- `direction is "unknown" when traversing to the current entry (equal indices)` — asserts the captured meta persists across the `SAME_STATES` rejection path.
- `recovery itself fails gracefully (double error)` — updated log-message assertion to the new `Failed to sync URL to router state` marker (the helper was renamed during refactor to decouple logging from URL-sync semantics).

### Migration

If your app relied on browser back/forward skipping `canDeactivate` guards, pass `forceDeactivate: true` explicitly:

```ts
router.usePlugin(navigationPluginFactory({ forceDeactivate: true }));
```

Most apps will not need this — the new default aligns with `browser-plugin` and with the `canDeactivate` contract in `@real-router/core`.
