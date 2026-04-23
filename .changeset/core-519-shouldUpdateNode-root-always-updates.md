---
"@real-router/core": patch
---

Fix `shouldUpdateNode("")` to always return `true`, matching the documented "Root — ALL route changes" contract (#519)

Root node `""` has no route-level identity — it represents the whole tree. Every adapter's docs state `useRouteNode("")` returns "ALL route changes"; the implementation, however, skipped updates when a transition's intersection was non-root (e.g. `users → users.user`, intersection = `"users"`). This was correct for nested-pattern layouts (each subtree has its own `useRouteNode("users")`) but wrong for flat patterns and for any code subscribing to `useRouteNode("")` directly for logging or cross-cutting concerns.

Symptom: root-level `<RouteView nodeName="">` with dot-notated Match segments like `<Match segment="users.user" exact>` never switched the active Match on parent→child, sibling-subtree, or child→parent transitions, even though the URL and `useRoute()` both updated correctly. Reproducible under every adapter (React, Preact, Solid, Vue, Svelte, Angular) and every plugin (browser-plugin, navigation-plugin, hash-plugin).

The fix is a two-line change in core `RoutesNamespace.shouldUpdateNode`: when `nodeName === DEFAULT_ROUTE_NAME`, return `true` unconditionally (instead of only on initial navigation). All adapter `RouteView` implementations receive the fix automatically via their shared `createRouteNodeSource` subscription. Two existing core tests that encoded the buggy behaviour as the contract are updated; adapter tests continue to pass unchanged.

No public API change. Consumers of `useRouteNode("")` may observe more re-renders per navigation, but each adapter's source already applies `stabilizeState` by `path`, so no-op transitions (identical URL) still deduplicate. This is a correctness fix aligning behaviour with the documented contract.

Verified end-to-end: `examples/tauri/react-navigation` e2e 8/8 (was 0/8), `examples/tauri/react` parent→child render works with browser-plugin (was broken).
