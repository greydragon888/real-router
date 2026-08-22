---
"@real-router/core": patch
---

fix(core): core's guards read intrinsics captured at module load (#1819, #1796)

Twelve files now bind `Object.hasOwn`, `Object.defineProperty`,
`Object.getOwnPropertyDescriptor`, `Object.getOwnPropertyNames`, `Object.keys`,
`Object.getPrototypeOf` and `Object.freeze` once, at module evaluation, and call
those bindings instead of reading the globals when a guard runs.

**No observable change for an untampered application.** The whole point is what
happens when something re-points one of them AFTER core has booted — a polyfill
loaded late, RUM/APM instrumentation, a browser extension, a test double.
Measured on the uncaptured form, with a stock control:

```
Object.hasOwn = (o, k) => k in Object(o)     // the ordinary naive polyfill
  buildPath("q", {}, {}) on route /q?toString
    ->  /q?toString=function%20toString()%20%7B%20%5Bnative%20code%5D%20%7D   (#1798)
  createRouter(routes, { queryParams: { arrayFormat: "bogusTypo" } })
    ->  ACCEPTED; every query URL then resolves to UNKNOWN_ROUTE               (#1318)

Object.freeze = o => o
  state.params / state.search are no longer frozen; a write is ACCEPTED

Object.defineProperty patched naively
  a `"__proto__"` route-config field swaps the record's prototype              (#1788)
  a dependency getter core exists to refuse is ACCEPTED, and then runs twice
```

Each of those holds after this change.

⚠ **This is robustness, not a security boundary**, and the distinction matters:
an attacker who can re-point `Object.hasOwn` already has script execution. What
it buys is that core's always-on invariant guards keep their meaning in a page
core does not control.

⚠ **It does NOT close a shim evaluated BEFORE core's module graph** — the
ordinary polyfill order. Measured: a naive `Object.hasOwn` imported ahead of core
reproduces #1798 verbatim. The window this closes is "after boot", and every
capture docblock says so.

⚠ `shared/` is deliberately outside this change. Its three trees are symlinked
into nine packages and carry the same class; they need their own pass, tracked
separately.
