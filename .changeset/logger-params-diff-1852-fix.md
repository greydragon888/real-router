---
"@real-router/logger-plugin": patch
---

The params diff no longer lies about a key the application also put on `Object.prototype` (#1852)

Two defects, one root, and the first one hid the second.

`params-diff` asked `key in toParams` to decide whether a key was removed. `in`
walks the PROTOTYPE chain, so a key an application also defined on
`Object.prototype` read as "still present" and stopped being reported as
removed — the diff stating something untrue about the navigation it describes.
That same `in` is why two of the three branches LOOKED immune to the write
hazard below: the branch that would have written was simply never taken.

The third branch's condition never asked the chain, so it did reach its write —
and an ambient accessor under a param name threw from there, taking the whole
log line with it (isolated by core as a listener error, so nothing else showed).
With a getter+setter pair the line printed empty instead.

Own-ness is now asked with `Object.hasOwn`, and all three writes go through
`putField` from `@real-router/core/utils`.

Part of #1901.
