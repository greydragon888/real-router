---
"@real-router/core": patch
---

Initial-route guard factories now see a fully-built router (#1331)

`canActivate` / `canDeactivate` factories from initial route definitions were compiled and executed mid-construction, on a half-assembled router — a factory calling `router.buildPath()`, `isActiveRoute()`, or `usePlugin()` threw a misleading `Invalid router instance — not found in internals registry` (only `getState()` worked). The pending-guard flush now runs as the final step of the constructor, so factories see a fully wired, registered, and bound router. As a hygiene follow-on, the validator is injected as a plain deps field, dropping the construction-time `try/catch` getter.

Hardening from the review of this fix:

- A factory that **throws** during the flush now disposes the instance before the constructor rethrows — a router reference leaked from an earlier factory is fail-closed (`ROUTER_DISPOSED`) instead of a live router with the remaining guards silently unregistered.
- `cloneRouter` copies the route config (encoders/decoders/defaultParams/custom fields) **before** re-compiling definition guards, so a factory re-executed on the clone observes the same fully-built instance it saw on the base.
- Side-effectful calls (`navigate`, `usePlugin`, route-CRUD) remain **out of contract** for guard factories — factories re-execute on `cloneRouter` and on guard-slot recompilation, duplicating any side effect. As defense-in-depth, `cloneRouter` skips replaying a plugin that a contract-violating factory already registered on the clone.
