---
"@real-router/core": patch
---

Fix `routes.update()` silently dropping plugin-defined custom route fields (#797)

`getRoutesApi(router).update(name, patch)` previously applied only the
structural/guard subset of the patch and silently discarded custom
(plugin-defined) fields — lifecycle hooks, `preload`, `searchSchema`, etc. — so
`getPluginApi(router).getRouteConfig(name)` kept returning stale values after an
update. `update` now persists custom fields into the store, symmetric with
`add`/`replace`.

Semantics mirror the structural fields:

- Shallow-merge by patch key — sibling custom fields are preserved.
- `null` removes a single field; emptying the record drops it entirely
  (`getRouteConfig` returns `undefined`, as after `add` with no custom fields).
- `undefined` is a no-op (leaves the field untouched).

Custom-field writes are applied **before** the structural config, so a throwing
custom-field getter aborts the update before any store write (atomic), mirroring
a throwing structural getter. Each merge writes a fresh record, so a previously
cloned router stays isolated from later updates on the source. A custom-field-only
patch emits no `TREE_CHANGED` event — consumers read custom fields lazily via
`getRouteConfig`, so the next read observes the new value (the event stays
structural-only by design).

The public API surface is unchanged: `RouteConfigUpdate` stays a closed
interface, and plugins opt into typed custom-field updates by augmenting it (see
`@real-router/lifecycle-plugin`, `@real-router/preload-plugin`,
`@real-router/search-schema-plugin`).
