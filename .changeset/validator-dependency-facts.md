---
"@real-router/core": minor
---

`RouterValidator` methods take facts rather than stores (#2382)

`RouterValidator.dependencies.validateDependencyCount` now takes
`(currentCount, maxDependencies, methodName)` and `validateDependencyExists`
takes `(name, value)`. Core reads all three facts at the call site, so the
analyser receives no container and reaches nothing through one.

Both arguments of the count check sit inside the optional chain, so a router with
no validator installed short-circuits the whole chain and never walks the key
list. `maxDependencies` arrives resolved by `createLimits`, which puts this path
outside the reach of the default-drift #1879 names.

`dependency-argument-channel-2382.test.ts` gates it by REACHABILITY rather than
identity — an identity check against the store admits every narrowed form, such
as `store.dependencies` or a `{ dependencies }` wrapper — and runs those rejected
forms through the same gate as negative controls.

`routes.validateParentOption` now takes `(parent)` and
`options.validateResolvedDefaultRoute` takes `(routeName)`. Both judge only the
route tree, which `PluginApi.getTree()` already hands out as the same object, so
passing it as an argument added a second address to a published object and
nothing else. The second of the two sits on the NAVIGATION path — it runs from
`navigateToDefault()` whenever `defaultRoute` is a callback — so the container
channel was never a configuration-time concern only.

`routes.validateRoutes` now takes `(routes, parentName?)` and
`routes.validateUpdateRoute` takes `(name, updates)`. The facts they judge besides
the tree come from two new `PluginApi` members:

- `getUrlParams(name)` — a route's path slot names, ancestors included; `[]` for
  a route the tree does not hold. Frozen and handed out by reference, like
  `getDeclaredQueryNames`, so a tree rebuild mints a new array.
- `getForwardMap()` — each source route's string `forwardTo` target, ONE hop and
  not resolved, as a fresh frozen null-prototype copy per call. One hop is the
  shape a cycle check needs: a resolved map collapses each chain to its last hop,
  and a cycle closing through a source that already forwards is not
  constructible there.

Breaking for anything that implements `RouterValidator` directly; pre-1.0, so
`minor`.
