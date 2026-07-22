---
"@real-router/core": minor
---

RFC-4 M2: remove the per-State meta sidecar; read route param ownership from the live matcher (#1548)

The internal `stateMetaStore` WeakMap that carried each state's per-segment
param-source map (`{ segment: { param: "url" | "query" } }`) is removed. That map
is 1:1 with the route name, so `getTransitionPath` now looks it up from the live
matcher by `state.name` (via a `RouteMetaLookup` callback → `getMetaForState`)
instead of storing a per-State copy.

**Breaking (pre-1.0):**

- `PluginApi.makeState` drops its trailing `meta` argument — the signature is now
  `makeState(name, params?, search?, path?)`. A plugin that called `makeState` with a
  fifth `meta` / `StateMetaInput` argument must drop it; the param-source map is
  derived from the route name automatically.
- The `StateMetaInput` type is no longer exported from `@real-router/core` (or its
  `/types` subpath).

Internal-only (not part of any public surface): `getStateMetaParams` /
`setStateMetaParams` and `stateMetaStore.ts` are gone. Behavior is unchanged for
every in-tree route name; a state whose route was removed from the tree (e.g. via
`replace()`) resolves to a full-reload transition path, exactly as the WeakMap-keyed
form did.
