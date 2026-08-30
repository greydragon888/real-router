---
"@real-router/ssr-utils": patch
---

Deciding intrinsics are read from a module-load capture ([#1971](https://github.com/greydragon888/real-router/issues/1971))

4 reads of `Object.keys` / `hasOwn` / `entries` / `values` /
`getPrototypeOf` in this package went to the live global, where an application
can re-point them after boot. They are now read once at module load — the
doctrine `@real-router/core`'s `guards.ts` states, extended across the repository
by the sweep in [#1971](https://github.com/greydragon888/real-router/issues/1971).

Two different consequences, one per file. In `serializeRouterState` the read
builds the hydration payload, so an empty answer ships a payload missing fields
the client expects. In `getStaticPaths` the reads are the LOST-KEY detector — it
round-trips each entry through `matchPath` and reports a supplied key that did
not survive — so a re-pointed `entries` or `keys` does not drop a path: it makes
the detector go silent, and a manifest quietly missing pages ships without the
warning that exists to catch it. That is this issue's own failure mode, in a
guard.

⚠ **What capture does NOT buy**, stated because the doctrine states it: it
narrows the window from "any time after boot" to "before the module loads". A
shim evaluated ahead of the module still wins ([#1798](https://github.com/greydragon888/real-router/issues/1798)).
This is robustness against polyfills, RUM/APM instrumentation, browser extensions
and test doubles — not a security boundary, since re-pointing `Object.keys`
already requires script execution.

No behaviour change in a healthy environment: an intrinsic nobody touched answers
the same either way.
