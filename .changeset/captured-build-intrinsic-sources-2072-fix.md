---
"@real-router/sources": patch
---

`canonicalJson` builds its sorted record through a captured `Object.create` (#2072)

The prototype-less accumulator that keeps a key named after an
`Object.prototype` member from colliding with an input that omits it was built
through the live intrinsic.

⚠ Capture narrows the window from "any time after boot" to "before this module
loads"; a shim evaluated ahead of the router still wins (#1798). It is robustness
against polyfills, instrumentation, extensions and test doubles, not a security
boundary.
