---
"@real-router/core": patch
---

Move guard registration logic from Router facade into RouteLifecycleNamespace

State-dependent validation (`isRegistering`, `hasCanActivate`, `countCanActivate`, handler limit checks) moved from `addActivateGuard`/`addDeactivateGuard` facade methods into new `RouteLifecycleNamespace.addCanActivate()`/`addCanDeactivate()` instance methods. Facade methods reduced to input validation + single delegation call. No public API changes.
