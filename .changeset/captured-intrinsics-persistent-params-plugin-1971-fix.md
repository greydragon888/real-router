---
"@real-router/persistent-params-plugin": patch
---

Deciding intrinsics are read from a module-load capture ([#1971](https://github.com/greydragon888/real-router/issues/1971))

14 reads of `Object.keys` / `hasOwn` / `entries` / `values` /
`getPrototypeOf` in this package went to the live global, where an application
can re-point them after boot. They are now read once at module load — the
doctrine `@real-router/core`'s `guards.ts` states, extended across the repository
by the sweep in [#1971](https://github.com/greydragon888/real-router/issues/1971).

`factory.ts` derives the persisted set from the config —
`Array.isArray(params) ? params : objectKeys(params)` — so a re-pointed `keys`
empties it and the plugin silently persists nothing. ⚠ Only for the OBJECT form
of the config; the array form (`persistentParamsPlugin(["lang"])`) never reaches
that read. The rest of the reads are `entries` and `hasOwn` in the per-navigation
merge, where an empty answer drops the carried params instead.

⚠ **What capture does NOT buy**, stated because the doctrine states it: it
narrows the window from "any time after boot" to "before the module loads". A
shim evaluated ahead of the module still wins ([#1798](https://github.com/greydragon888/real-router/issues/1798)).
This is robustness against polyfills, RUM/APM instrumentation, browser extensions
and test doubles — not a security boundary, since re-pointing `Object.keys`
already requires script execution.

No behaviour change in a healthy environment: an intrinsic nobody touched answers
the same either way.
