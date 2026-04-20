---
"@real-router/core": minor
---

Add `PluginApi.emitTransitionError(error)` (#483)

Plugins can now emit `$$error` events without going through the navigation pipeline. Delegates to `eventBus.sendFailSafe` internally with the current router state as `fromState` and `toState: undefined`. Safe to call at any FSM state.

Used by `@real-router/browser-plugin`, `@real-router/navigation-plugin`, and `@real-router/hash-plugin` to surface strict-mode errors (`ROUTE_NOT_FOUND` on unmatched URL) through the standard `onTransitionError` hook instead of silently falling back to `navigateToDefault()`.
