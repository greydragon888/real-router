---
"@real-router/core": minor
---

`RouterValidator` methods take facts rather than stores (#2382)

`RouterValidator.dependencies.validateDependencyCount` now takes
`(currentCount, maxDependencies, methodName)` and `validateDependencyExists`
takes `(name, value)`. Core reads all three facts at the call site, so the
analyser receives no container and reaches nothing through one.

A router with no validator installed never walks the key list. With one, the
count and the membership test that decides whether a write adds a key come from
the same `Object.keys` list (#1815 / #2064), so they cannot disagree, and
`setDependencies` reads that list once per call rather than once per new key. A
symbol dependency name — outside what `set` is typed to accept — is never in the
list, so overwriting one reports as a new key rather than as an overwrite.
`maxDependencies` arrives resolved by `createLimits`, which puts this path
outside the reach of the default-drift #1879 names.

`validator-argument-channel-2382.test.ts` gates every validator method against
both stores by REACHABILITY rather than identity — an identity check admits every
narrowed form, such as `store.matcher`, `config.forwardMap` or a
`{ dependencies }` wrapper — judged at call time, with what `PluginApi` publishes
(`getTree()`, `getResolvedLimits()`) subtracted, and runs the rejected forms
through the same gate as negative controls.

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

Three more `PluginApi` members hand out what `@real-router/validation-plugin`
reads when it is installed, so it reads no route store and no limits off a
dependency store:

- `getResolvedLimits()` — the frozen resolved limits, the object core's own
  dependency-count check reads.
- `getDependencyKeys()` — the dependency names as `Object.keys` lists them,
  `"__proto__"` included, as a fresh frozen array per call.
  `Object.keys(getDependenciesApi(router).getAll())` comes out one short on a
  `"__proto__"` dependency, because that container withholds it.
- `getExternalGuardNames()` — route names carrying a guard added through
  `addActivateGuard` / `addDeactivateGuard`, deactivate first, each once, as a
  fresh frozen array per call. A guard declared on a route definition does not
  put its name there.

A route's own config slots need no member: `getRoutesApi(router).get(name)`
reports every one of them.

Breaking for anything that implements `RouterValidator` directly; pre-1.0, so
`minor`.
