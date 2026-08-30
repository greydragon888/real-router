---
"@real-router/core": patch
---

Every deciding intrinsic is read from a module-load capture ([#1971](https://github.com/greydragon888/real-router/issues/1971))

`guards.ts` states the rule and the measurement behind it — *"a guard is only as
strong as the intrinsic it reads WHEN IT RUNS"*, after one naive `Object.hasOwn`
polyfill walked through five sibling readers while the single captured guard
held. Of the 32 files touching a deciding intrinsic, 17 captured one and 20 read
one raw — and five did BOTH, including
`utils/ingest.ts`, which owns the write discipline and captured two intrinsics
two hundred lines above a raw `Object.entries` — both in the same commit.

All 52 raw reads in `packages/core/src` now go through a capture. Seven
intrinsics are in scope, the ones that answer *"what is on this object"* for a
value the module did not build: `hasOwn`, `keys`, `entries`, `values`,
`getOwnPropertyDescriptor`, `getOwnPropertyNames`, `getPrototypeOf`.

Measured, a re-pointed intrinsic changed a verdict:

```
copyFields with a shimmed Object.entries   {"id":"7","tab":"a"} -> {"tab":"a"}
```

The key dropped silently — no throw, no warning, the bag copied "successfully".

⚠ **What capture does NOT buy**, stated because the doctrine states it: it
narrows the window from "any time after boot" to "before the module loads". A
shim evaluated ahead of the module still wins ([#1798](https://github.com/greydragon888/real-router/issues/1798)).
This is robustness against polyfills, RUM/APM instrumentation, browser extensions
and test doubles — not a security boundary, since re-pointing `Object.keys`
already requires script execution.

No behaviour change in a healthy environment: an intrinsic nobody touched answers
the same either way.

The convention is now derived rather than remembered:
`captured-intrinsics-authority-1971.test.ts` walks core and `shared/` and fails
on any unclassified raw read, so the sweep does not have to run a third time.
