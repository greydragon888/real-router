---
"@real-router/ssr-data-plugin": patch
---

The deferred-promise record reads a captured `Object.create` (#2072)

The per-request record of deferred promises is prototype-less so a loader key
named after an `Object.prototype` member cannot resolve through the chain. It
was built through the live `Object.create`; it now reads a module-load capture
(#2072).

⚠ Capture narrows the window from "any time after boot" to "before this module
loads"; a shim evaluated ahead of the router still wins (#1798). It is robustness
against polyfills, instrumentation, extensions and test doubles, not a security
boundary.
