---
"@real-router/core": minor
---

Remove `PluginApi.buildState` (#1548)

**Breaking Change:** `getPluginApi(router).buildState(name, params)` has been removed. After the RFC-4 M2 forwardState channel canonicalization it silently dropped the ENTIRE query channel — including user-supplied values riding in the params bag (`buildState("x", { page: "2" })` on an `/x?page` route returned `{ params: {}, search: {} }`) — while its full-composition sibling already exists.

**Migration:**

```diff
- const routeInfo = api.buildState(name, params);       // RouteTreeState | undefined
+ const state = api.buildNavigationState(name, params); // State | undefined
```

`buildNavigationState` resolves forwardTo the same way and returns `undefined` for unknown routes; unlike `buildState` it also applies route defaults and carries the query channel (`state.search`, `state.path`).
