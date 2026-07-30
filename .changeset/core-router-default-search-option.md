---
"@real-router/core": minor
---

Add the `defaultSearch` router option — the query channel of the default route (#1548)

`RouterOptions` carried `defaultParams` with no query twin, so the default
route's query defaults could be spelled only in the path bag:

```ts
createRouter([{ name: "list", path: "/list?tab" }], {
  defaultRoute: "list",
  defaultParams: { tab: "a" }, // the only slot there was
});
```

That reached the URL only because the `forwardState` seam still re-separates
channels on the way through — stage ②, the repair the navigation pipeline is
designed to remove. Measured by neutralising that stage: a route's own
`defaultParams` and a `forwardTo` hop's both survive it (their split lives in
the pipeline, #1549 / #1570), but the router option did not — `navigateToDefault`
passed `undefined` in the query slot, so the key stayed in `state.params` and
never printed. No error, no correct spelling to migrate to, and no test to catch
it: the existing coverage uses only undeclared keys, which legitimately stay in
`params`.

```ts
createRouter([{ name: "list", path: "/list?tab&sort" }], {
  defaultRoute: "list",
  defaultSearch: { tab: "a", sort: "z" }, // → /list?tab=a&sort=z
});
```

Static value or a dependency-resolved callback, symmetric with `defaultRoute` /
`defaultParams` — the default route can itself be chosen dynamically, so its
query defaults have to be able to follow. Defaults to `{}`, so nothing changes
for a router that does not set it. `DefaultSearchCallback` is exported
alongside `DefaultParamsCallback`.

Also corrects the `Route.defaultParams` docstring, which claimed a
query-declared name placed there "is NOT routed to the query string" — the
opposite of what #1549 deliberately ships.
