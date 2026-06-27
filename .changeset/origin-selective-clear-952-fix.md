---
"@real-router/core": minor
---

Fix: `update(name, { canActivate: null })` no longer clears an external guard (origin-selective clear) (#952)

`clearCanActivate` / `clearCanDeactivate` were origin-blind — they deleted both the definition-sourced and the external guard for a route. So `update(name, { canActivate: null })` (which only manages the route-config / definition guard) also wiped a guard registered independently via `getLifecycleApi().addActivateGuard()`. Both clear methods now take a `definitionOnly` flag, and `update`'s `canActivate: null` / `canDeactivate: null` branches pass it — clearing only the definition slot and recompiling the surviving external guard. Route removal / `clearAll` keep clearing both slots (the default).
