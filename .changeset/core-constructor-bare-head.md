---
"@real-router/core": patch
---

The constructor refusals name no door, because two doors reach them (#2487)

Six messages opened with `[router.constructor]`, a head no caller can look up:
`createRouter(...)` and `cloneRouter(...)` both reach these checks through
`new RouterClass(...)`, so naming one of them would name a call half the callers
did not make, and `constructor` names one nobody types.

They take the bare `[router]` form instead — the form the repository already uses
where several doors reach one refusal. Observable message change, no behaviour
change; the field path each message carries is untouched, which is what a reader
follows.
