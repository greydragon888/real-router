---
"@real-router/persistent-params-plugin": patch
---

Refactor into class-based architecture (#226)

Internal refactoring: replaced monolithic factory closure with `PersistentParamsPlugin` class, migrated from legacy per-method interceptors to `addInterceptor` API, removed dead code and monkey-patching relics.
