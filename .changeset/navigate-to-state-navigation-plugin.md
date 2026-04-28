---
"@real-router/navigation-plugin": patch
---

Use `api.navigateToState` in the navigate-event handler (#525)

`navigate-handler.ts` now hands the `State` produced by `api.matchPath(url)`
directly to `api.navigateToState(state, opts)` inside `event.intercept(...)`,
instead of re-deconstructing it as
`router.navigate(state.name, state.params, opts)`. This avoids running
`forwardState` and `buildPath` a second time on the navigate-event hot
path, and (most importantly) preserves the trailing slash from the source
URL through to `state.path` in `trailingSlash:"preserve"` mode.

Affected file: `packages/navigation-plugin/src/navigate-handler.ts` —
`event.intercept(...)` body now calls `api.navigateToState(matched, …)`.

No public API change for plugin consumers. Inherits the 5–20% reduction
per navigate event (#525).
