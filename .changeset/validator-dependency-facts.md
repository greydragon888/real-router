---
"@real-router/core": minor
---

The dependency validators take facts rather than the store (#2382)

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

Breaking for anything that implements `RouterValidator` directly; pre-1.0, so
`minor`.
