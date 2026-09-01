---
"@real-router/core": patch
---

`Object.create` is read from a module-load capture (#2072)

The prototype-less records core builds — the param-type registry, the dependency
store, the matcher's static-child table, the route-config side tables, the
lifecycle records and the FSM's normalised tables — were built through the live
`Object.create`. #1971 swept the intrinsics that ANSWER a question and put
`create` out of scope because it "decides nothing"; it builds the object every
one of those answers is about, so re-pointing it removed the guarantee.

Measured on the uncaptured form: a route declaring `:__proto__` lost that param
from its registry (#1825 restored), and the dependency store gained
`Object.prototype`, after which `getDependenciesApi().get()` answered an
ambient member while `has()` — reading the captured `hasOwn` — denied it.

⚠ Capture narrows the window from "any time after boot" to "before this module
loads"; a shim evaluated ahead of the router still wins (#1798). It is robustness
against polyfills, instrumentation, extensions and test doubles, not a security
boundary.
