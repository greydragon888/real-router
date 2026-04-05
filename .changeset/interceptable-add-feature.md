---
"@real-router/core": minor
---

Add interceptable `add` method for route addition hooks (#406)

The `add` method in `getRoutesApi()` is now interceptable via `addInterceptor("add", fn)`. Plugins can hook into dynamic route additions to perform validation or side effects when routes are added at runtime.
