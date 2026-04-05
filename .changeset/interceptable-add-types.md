---
"@real-router/types": minor
---

Add `add` to `InterceptableMethodMap` interface

New `add` entry in `InterceptableMethodMap` enables type-safe `addInterceptor("add", fn)` for plugins that need to react to dynamic route additions.
