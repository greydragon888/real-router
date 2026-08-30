---
"@real-router/logger-plugin": patch
---

Deciding intrinsics are read from a module-load capture ([#1971](https://github.com/greydragon888/real-router/issues/1971))

7 reads of `Object.keys` / `hasOwn` / `entries` / `values` /
`getPrototypeOf` in this package went to the live global, where an application
can re-point them after boot. They are now read once at module load — the
doctrine `@real-router/core`'s `guards.ts` states, extended across the repository
by the sweep in [#1971](https://github.com/greydragon888/real-router/issues/1971).

The reads are in `internal/params-diff.ts`, and they split by role.
`entries` and `hasOwn` decide the diff's CONTENT — walking both bags and asking
whether the other one holds the key — so a re-pointed one makes the log miss a
change that happened, or invent a removal and an addition for a key that never
moved. `keys` is the emptiness test that gates whether the diff is printed at
all, so re-pointing it silences a real diff rather than corrupting it.

⚠ **What capture does NOT buy**, stated because the doctrine states it: it
narrows the window from "any time after boot" to "before the module loads". A
shim evaluated ahead of the module still wins ([#1798](https://github.com/greydragon888/real-router/issues/1798)).
This is robustness against polyfills, RUM/APM instrumentation, browser extensions
and test doubles — not a security boundary, since re-pointing `Object.keys`
already requires script execution.

No behaviour change in a healthy environment: an intrinsic nobody touched answers
the same either way.
