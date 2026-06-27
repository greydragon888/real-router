---
"@real-router/core": patch
---

Assert per-instance options immutability in `RoutesNamespace.#getBuildPathOptions` (#957)

`#getBuildPathOptions` caches its result on the first call and returns it on every subsequent call, ignoring the `options` argument. This is safe because the sole caller (`Router.buildPath`) always passes the same immutable, deep-frozen per-instance options (`this.#options.get()`). A dev-build assertion now logs a warning if a future caller passes a differing `options` reference, making the cache-ignores-argument contract explicit and catchable. No behavior change for supported usage.
