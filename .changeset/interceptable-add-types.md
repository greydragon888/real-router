---
"@real-router/types": minor
---

Add `add` to `InterceptableMethodMap` interface (#406)

New `add` entry in `InterceptableMethodMap` enables type-safe `addInterceptor("add", fn)` for plugins that need to react to dynamic route additions.
