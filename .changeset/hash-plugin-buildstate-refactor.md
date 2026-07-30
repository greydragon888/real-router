---
"@real-router/hash-plugin": patch
---

Migrate `replaceHistoryState` internals off the removed `PluginApi.buildState` (#1548)

Internal refactor in the shared `browser-env` plugin-utils: `createReplaceHistoryState` now resolves the target route via `buildNavigationState`. Observable behavior is unchanged — same existence check (throws for an unknown route), same forwardTo resolution, and the caller's `search` remains the only query source for the `history.state` record.
