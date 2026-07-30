---
"@real-router/browser-plugin": patch
---

Migrate `replaceHistoryState` internals off the removed `PluginApi.buildState` (#1548)

Internal refactor in the shared `browser-env` plugin-utils: `createReplaceHistoryState` now resolves the target route via `buildNavigationState`. Observable behavior is unchanged — same existence check (throws for an unknown route), same forwardTo resolution, and the same query source for the `history.state` record.
