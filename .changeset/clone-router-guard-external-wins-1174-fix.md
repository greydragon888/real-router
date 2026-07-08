---
"@real-router/core": minor
---

fix(core): guard resolution is now external-wins, fixing cloneRouter guard divergence (#1174)

When a route holds both a definition guard (route-config `canActivate`/`canDeactivate`) and an external guard (`addActivateGuard`/`addDeactivateGuard`), the compiled guard is now the **external** one regardless of registration order. Previously registration was last-add-wins, which `cloneRouter` inverted: it re-registers guards in a fixed definition→external order, so a clone of a base whose effective guard was a definition (added after an external) silently ran the *external* guard instead — a security divergence in SSR multi-tenancy, where the per-request clone is the authorization boundary.

Committing to external-wins in `#registerHandler` (matching `#recompileSlot` / `clearDefinitionGuards`, external-wins since #1192) resolves the latent register↔recompile policy split, makes the clone's fixed replay yield the source's effective guard with no extra tracking, and keeps app-added guards authoritative over config defaults.

**Breaking:** a definition guard registered while an external guard is live on the same route no longer overrides it (registration order is now irrelevant — external always wins).
