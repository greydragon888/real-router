---
"@real-router/core": minor
---

`RouterValidator.plugins.validatePluginLimit` takes the number of plugins a call would register (#2413)

The signature is now `(currentCount, newCount, limits)`. `usePlugin` passes the
number of distinct factories in the call as `newCount` — a factory repeated in one
call is registered once, and `false`, `null` and `undefined` entries are skipped —
so the validator judges a batch whole, before its first factory runs.

An implementation of `RouterValidator` written for `(count, limits)` now receives
`newCount` where it read `limits`: take the new second parameter. Upgrade
`@real-router/validation-plugin` together with core — its validator implements the
new signature.
