---
"@real-router/core": minor
---

Say WHICH kind of router core could not find (#2294)

`getInternals` / `getPluginApi` identify a router by object identity in a
module-level `WeakMap`, so the lookup misses for three unrelated things and the
refusal named none of them: an object that is not a router, a `Proxy` over a real
one (Vue `reactive()` / Pinia), and a router built by another copy of
`@real-router/core`.

Core now brands every router it registers with `Symbol.for("real-router.router")`
— a global symbol, so it crosses a module boundary, and a transparent proxy
forwards the read. A real router core cannot reach gets a message naming both
reachable causes and their remedies; an object that is not a router keeps the
message it had.
