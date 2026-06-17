---
"@real-router/core": patch
---

Freeze nested `paramMeta` on the route tree (#747)

The route tree is documented as immutable, but the nested `paramMeta` object and
its `urlParams`/`queryParams`/`spatParams` arrays were left mutable — a tree
reachable from the public API (`getPluginApi(router).getTree()`) could be
mutated via e.g. `node.paramMeta.urlParams.push(...)`. They are now frozen,
closing the immutability contract (invariant CC2).

`constraintPatterns` is a `Map`, which `Object.freeze` cannot make read-only; it
stays protected at the type level via `ReadonlyMap` and is documented as an
explicit CC2 exception.
