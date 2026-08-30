---
"@real-router/persistent-params-plugin": patch
---

Deciding intrinsics are read from a module-load capture ([#1971](https://github.com/greydragon888/real-router/issues/1971))

14 reads of `Object.keys` / `hasOwn` / `entries` / `values` /
`getPrototypeOf` in this package went to the live global, where an application
can re-point them after boot. They are now read once at module load — the
doctrine `@real-router/core`'s `guards.ts` states, extended across the repository
by the sweep in [#1971](https://github.com/greydragon888/real-router/issues/1971).

The 14 fall into three groups, with three different consequences.

`factory.ts` (1) derives the persisted set from the config —
`Array.isArray(params) ? params : objectKeys(params)` — so a re-pointed `keys`
empties it and the plugin silently persists nothing. ⚠ Only for the OBJECT form
of the config; the array form (`persistentParamsPlugin(["lang"])`) never reaches
that read.

`param-utils.ts` and `plugin.ts` (10) are the per-navigation merge, all `entries`
and `hasOwn`, where an empty answer drops the carried params instead of losing
the set that defines them.

`validation.ts` (3) splits again. `getPrototypeOf` is the plain-object test
(`!== Object.prototype`, rejecting a `Date` or a `Map`) and `entries` feeds the
`.every()` that checks each key and value — and `.every()` on an empty array is
`true`, so a re-pointed `entries` makes the plugin ACCEPT any config it exists to
refuse. The third, `keys`, is in a different function: it derives the names to
test for `UNPUBLISHABLE_PARAM_KEY`, so re-pointing it skips that warning rather
than admitting anything.

⚠ **What capture does NOT buy**, stated because the doctrine states it: it
narrows the window from "any time after boot" to "before the module loads". A
shim evaluated ahead of the module still wins ([#1798](https://github.com/greydragon888/real-router/issues/1798)).
This is robustness against polyfills, RUM/APM instrumentation, browser extensions
and test doubles — not a security boundary, since re-pointing `Object.keys`
already requires script execution.

No behaviour change in a healthy environment: an intrinsic nobody touched answers
the same either way.
