---
"@real-router/types": patch
---

Fix stale `RouterWiringBuilder` pointer in the `InterceptableMethodMap` checklist comment (#1334)

The "To add a new interceptable method" doc comment pointed at the deleted `RouterWiringBuilder`; the `createInterceptable()` wrapping lives in the `registerInternals` block of the Router constructor.
