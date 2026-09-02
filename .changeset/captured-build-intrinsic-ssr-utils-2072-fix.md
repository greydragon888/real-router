---
"@real-router/ssr-utils": patch
---

`serializeRouterState` builds its filtered record through a captured `Object.create` (#2072)

The prototype-less record that stops a filtered context key from being dropped by
the prototype chain was built through the live intrinsic.

⚠ Capture narrows the window from "any time after boot" to "before this module
loads"; a shim evaluated ahead of the router still wins (#1798). It is robustness
against polyfills, instrumentation, extensions and test doubles, not a security
boundary.
