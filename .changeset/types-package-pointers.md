---
"@real-router/sources": patch
---

Two comments named `@real-router/types`, a package that does not exist (#2111)

`guardLeaveListener.ts` said `LeaveState` / `LeaveFn` "live in
`@real-router/types`" and named a dependency on it as the thing the house rule
avoids. That package was folded into core by #1520; the surface is the
`@real-router/core/types` subpath, which is what the file actually resolves
against.
