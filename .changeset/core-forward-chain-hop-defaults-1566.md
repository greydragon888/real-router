---
"@real-router/core": minor
---

Layer the defaults of every hop on a `forwardTo` chain (#1566)

`forwardState` consulted the `defaultParams` of the **entered** route only, while
the chain had already been collapsed to its terminal — so a default declared on
an *intermediate* hop never reached the target:

```ts
createRouter([
  { name: "m1", path: "/m1", forwardTo: "m2" },
  { name: "m2", path: "/m2", forwardTo: "m3", defaultParams: { p: "P2" } },
  { name: "m3", path: "/m3/:p" },
]);

await router.navigate("m1");
// before: rejects — [SegmentMatcher.buildPath] Missing required param 'p'
// now:    "/m3/P2"
```

The URL direction failed differently and silently: `matchPath("/m1")` committed a
state naming the resolved target but carrying the **source** URL and an empty
params bag (`name: "m3"`, `path: "/m1"`, `params: {}`). `canNavigateTo` simply
returned `false`. Both are consistent now.

Every forwarding hop's defaults are layered in walk order, so an **earlier** hop
wins over a later one and the caller wins over all of them. The terminal route is
still excluded — its own defaults are merged downstream by the state builder
(#1549), unchanged.

Covers all three chain kinds: static, dynamic (`forwardTo: () => "…"`), and mixed
static→dynamic — the dynamic resolver now reports the hops it walked instead of
only the terminal. Single-hop chains and the query channel (`defaultSearch`, which
has no source-layering by design) are unaffected.
