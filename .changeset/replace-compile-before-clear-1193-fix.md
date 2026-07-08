---
"@real-router/core": patch
---

A failed `replace()` no longer erases the old definition guards (#1193)

`replace()` ran `clearDefinitionGuards()` **before** the #956 pre-swap guard compile (which lived inside `adoptRouteArtifacts`). So a new batch carrying a guard factory that throws on compile (or returns a non-function) aborted the swap with the tree intact — **but the old definition guards were already cleared**: a route-config `canActivate` that blocked before the failed `replace()` silently *allowed* after it, a security-flavored fail-open. The window was also untested (the #956 tests cover the `add` path only). The compile is now hoisted into `replace()`'s PREPARE phase, before `clearDefinitionGuards`, so a malformed batch aborts with **both** the tree AND the old definition guards intact (mirroring #1046's handler-limit hoist). `add()` is unaffected — it has no clear step and still compiles inside `adoptRouteArtifacts`.
