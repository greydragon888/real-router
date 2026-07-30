---
"@real-router/core": minor
---

Make `Options` generic over the router's dependencies (#1548)

The three resolver callbacks receive a `getDependency` accessor at runtime, but
`Options` was not parameterised, so it defaulted to `object` — whose `keyof` is
`never`. Every key was rejected, and the form the wiki documents did not compile:

```ts
createRouter<MyDeps>(routes, {
  defaultParams: (getDependency) => ({ id: getDependency("currentUserId") }),
});
// error TS2345: Argument of type '"currentUserId"' is not assignable
//               to parameter of type 'never'
```

`Options<Dependencies>` fixes all three (`defaultRoute`, `defaultParams`,
`defaultSearch`), and an unknown key is still rejected — both directions are
pinned by a type-level test.

The parameter deliberately does not spread. Consumers that RESOLVE callbacks
take `Options<D>`; consumers that merely READ configuration — `PluginApi.getOptions`,
the matcher, the URL builders — take the new `AnyOptions` (`= Options<never>`,
which accepts every instantiation by contravariance, unlike `Options<object>`
which accepts none). Measured before choosing that split: no plugin in the repo
reads `defaultRoute` / `defaultParams` / `defaultSearch` at all — they read
`allowNotFound` and `limits`. All 16 packages type-check unchanged.

`Dependencies` defaults to `DefaultDependencies`, so every existing `Options`
reference keeps compiling; `AnyOptions` and `DefaultSearchCallback` are exported
alongside the existing option types.
