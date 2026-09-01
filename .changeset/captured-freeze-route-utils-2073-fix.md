---
"@real-router/route-utils": patch
---

The returned route views read a captured `Object.freeze` (#2073)

A value this package freezes at RUNTIME was frozen through the live
`Object.freeze`, so an application that re-pointed the intrinsic after boot got
back an object that is not frozen at all. It now reads a module-load capture.

⚠ Capture narrows the window from "any time after boot" to "before this module
loads"; a shim evaluated ahead of the router still wins (#1798). It is robustness
against polyfills, instrumentation, extensions and test doubles, not a security
boundary. Module-scope constants are out of scope by the same argument — they are
frozen before any application code can run.
