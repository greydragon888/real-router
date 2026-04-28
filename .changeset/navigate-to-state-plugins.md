---
"@real-router/browser-plugin": patch
"@real-router/hash-plugin": patch
"@real-router/navigation-plugin": patch
---

Use `api.navigateToState` for browser-initiated navigation (#525)

`browser-plugin`, `hash-plugin` and `navigation-plugin` now hand the
`State` produced by `api.matchPath(url)` directly to
`api.navigateToState(state, opts)` instead of re-deconstructing it as
`router.navigate(state.name, state.params, opts)`. This avoids running
`forwardState` and `buildPath` a second time on the popstate /
navigate-event hot path, and (most importantly) preserves the trailing
slash from the source URL through to `state.path` in
`trailingSlash:"preserve"` mode.

Affects:

- `packages/navigation-plugin/src/navigate-handler.ts` — the
  `event.intercept(...)` handler now calls
  `api.navigateToState(matched, …)`.
- `shared/browser-env/popstate-handler.ts` (consumed by `browser-plugin`
  and `hash-plugin` via symlink) — `getRouteFromEvent` now returns a
  `State` (built via `api.makeState` from `evt.state` when present, or
  `api.matchPath` otherwise), and the popstate path uses
  `api.navigateToState` to commit it.

No public API change for plugin consumers.
