---
"@real-router/core": minor
---

Add `PluginApi.buildPathResolved` — print a path for an already-resolved intent

`router.buildPath` runs the `forwardState` chain one door lower (#2087), which
is right for a caller holding a raw intent and a second pass for one that has
just resolved. `buildPathResolved` is the same printer without that chain, so a
caller who resolved for themselves — building an `href` is the case it exists
for — costs a plugin's interceptor ONE invocation per operation instead of two.

- New member on `PluginApi` (`@real-router/core/api`) and on `RouterInternals`
  (`@real-router/core/validation`).
- Identical to `router.buildPath` otherwise: route defaults are merged,
  `forwardTo` is not resolved, and an unprintable intent throws the same error
  from the same place.
