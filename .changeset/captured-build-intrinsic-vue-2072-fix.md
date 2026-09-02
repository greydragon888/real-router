---
"@real-router/vue": patch
---

The scroll store reads a captured `Object.create` (#2072)

The scroll-position store and the canonical replacer build prototype-less records
so a scroll key named after an `Object.prototype` member cannot collide with the
chain. Both were built through the live `Object.create`; they now read a
module-load capture (#2072).

⚠ Capture narrows the window from "any time after boot" to "before this module
loads"; a shim evaluated ahead of the router still wins (#1798). It is robustness
against polyfills, instrumentation, extensions and test doubles, not a security
boundary.
