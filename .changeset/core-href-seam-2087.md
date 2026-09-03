---
"@real-router/core": minor
---

`router.buildPath` runs the injection seam above the route-default merge (#2087)

The href a `<Link>` renders and the URL a click commits are one string again when
a plugin injects a query value. They were not: core has two seams a plugin can
inject through, and they sit on opposite sides of the route-default merge —
`forwardState` above it, the ⑤a `buildPath` executor below. `navigate` runs both,
`router.buildPath` reached only the second, so a route `defaultSearch` filled the
slot first and the injected value lost to it.

```ts
const router = createRouter([
  { name: "list", path: "/list?page&q", defaultSearch: { page: "1" } },
]);
router.usePlugin(persistentParamsPluginFactory({ page: "7" }));

router.buildPath("list", {}, { q: "x" }); // was "/list?page=1&q=x"
(await router.navigate("list", {}, { q: "x" })).path; //     "/list?page=7&q=x"
```

`router.buildPath` now puts the caller's intent through the `forwardState` chain
before canonicalising, with a terminal that resolves no `forwardTo` — the door
stays literal, `buildPath("src")` still answers about `"src"`. Both doors then
inject from the same side of the merge, which is `INVARIANTS.md` row 7.

**For plugin authors.** A `forwardState` interceptor now runs on `router.buildPath`
as well, once per call. If yours assumed that seam was navigation-only, it now
also shapes every rendered href — which for a validator is the point, and for an
injector is a behaviour change worth checking. What it receives is the caller's
own `params` object, the same one the navigate door hands that chain — the door
canonicalises below the seam, not above it. The ⑤a `buildPath` interceptable is
unchanged and still runs where it always did.

A path that both resolves a state and then rebuilds a URL from the resolved
channels would ask the seam twice, and an interceptor whose output depends on
its input would apply itself twice — putting a URL beside a record that
contradicts it. `replaceHistoryState` in the three URL plugins was the one such
path in the tree; it now prefixes the resolved `state.path` instead of
re-deriving, which also drops a whole trip through the `buildPath` chain per
history record.
