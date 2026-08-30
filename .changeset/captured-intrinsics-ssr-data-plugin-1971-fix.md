---
"@real-router/ssr-data-plugin": patch
---

Deciding intrinsics in the shared sources are captured at module load ([#1971](https://github.com/greydragon888/real-router/issues/1971))

This package bundles `shared/ssr`, whose reads of
`Object.keys` / `hasOwn` / `entries` / `values` / `getPrototypeOf` went to the
live global and can be re-pointed after boot. They are now read once at module
load, the doctrine `guards.ts` states for core and the sweep in [#1971](https://github.com/greydragon888/real-router/issues/1971) extended
to the shared half.

The reads decide what is on an object the module did not build, so a re-pointed
intrinsic changes a verdict rather than a value.

⚠ **What capture does NOT buy**, stated because the doctrine states it: it
narrows the window from "any time after boot" to "before the module loads". A
shim evaluated ahead of the module still wins ([#1798](https://github.com/greydragon888/real-router/issues/1798)).
This is robustness against polyfills, RUM/APM instrumentation, browser extensions
and test doubles — not a security boundary, since re-pointing `Object.keys`
already requires script execution.

No behaviour change in a healthy environment: an intrinsic nobody touched answers
the same either way.
