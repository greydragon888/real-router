---
"@real-router/browser-plugin": patch
---

Use `api.navigateToState` for popstate-driven navigation (#525)

The popstate handler now hands the `State` produced by `api.matchPath(url)`
directly to `api.navigateToState(state, opts)` instead of re-deconstructing
it as `router.navigate(state.name, state.params, opts)`. This avoids
running `forwardState` and `buildPath` a second time on the popstate hot
path, and (most importantly) preserves the trailing slash from the source
URL through to `state.path` in `trailingSlash:"preserve"` mode.

Affected file: `shared/browser-env/popstate-handler.ts` (consumed via
symlink). `getRouteFromEvent` now returns a `State` (built via
`api.makeState` from `evt.state` when present, or `api.matchPath`
otherwise); the popstate path uses `api.navigateToState` to commit it.

No public API change for plugin consumers. Inherits the 5–20% reduction
per popstate event (#525).
