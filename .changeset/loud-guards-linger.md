---
"@real-router/core": minor
---

Make guard clearing origin-explicit so a route-config guard is never wiped by an external-guard operation (#1171)

The internal guard-clear primitive defaulted to clearing BOTH origin slots (route-config + external), so several operations silently erased a route-config guard they should have left alone. Guard clearing now names its origin lane explicitly (no origin-blind default), fixing two observable behaviors:

- **Post-leave auto-cleanup is external-only.** A route-config `canDeactivate` was one-shot — the first permitted leave erased it, so re-entry was unguarded (e.g. an unsaved-changes confirmation silently broke on the second visit), `getRoutesApi().get(name).canDeactivate` became `undefined`, and a `cloneRouter` taken after the leave never received it. Now only the external, component-managed guard is auto-cleaned; a config guard lives as long as the route is in the tree, symmetric with `canActivate`.
- **`removeActivateGuard` / `removeDeactivateGuard` are external-only.** They are the inverse of `addActivateGuard` / `addDeactivateGuard` (which register external guards), so they now clear only the external guard and leave a route-config guard intact. To remove a config guard, use `getRoutesApi(router).update(name, { canActivate: null })` / `{ canDeactivate: null }`.

Route removal and `dispose()` still clear both origins (the route/router is gone).

Note: because a route-config `canDeactivate` now persists, it counts toward the per-type handler tally the way a config `canActivate` always has — so under `@real-router/validation-plugin`'s `maxLifecycleHandlers`, a config `canDeactivate` occupies a slot for the life of the route instead of freeing it on first leave.
