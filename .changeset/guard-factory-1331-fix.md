---
"@real-router/core": patch
---

Initial-route guard factories now see a fully-built router (#1331)

`canActivate` / `canDeactivate` factories from initial route definitions were compiled and executed mid-construction, on a half-assembled router — a factory calling `router.buildPath()`, `isActiveRoute()`, or `usePlugin()` threw a misleading `Invalid router instance — not found in internals registry` (only `getState()` worked). The pending-guard flush now runs as the final step of the constructor, so factories see a fully wired, registered, and bound router. As a hygiene follow-on, the validator is injected as a plain deps field, dropping the construction-time `try/catch` getter.
