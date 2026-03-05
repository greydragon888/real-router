---
"@real-router/types": minor
---

Add `InterceptableMethodMap` and `InterceptorFn` generic types (#224)

New generic types for type-safe interceptor registration. `InterceptableMethodMap` maps interceptable method names to their argument types, and `InterceptorFn<M>` provides the correctly-typed interceptor function signature for each method.
