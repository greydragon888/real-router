---
"@real-router/core": minor
---

Apply a route's query defaults in `buildPath` when the caller names no search channel (#1578)

Routing a route's own defaults by channel (#1549) had to spare one caller: a v1
single-bag call (`buildPath(name, { page })`) rides the declared query key in the
params bag and depends on the matcher's `search ?? params` fallback to print it.
Defining `search` switches that fallback off, so the split was skipped whenever
the `search` argument was absent.

That test was one step too wide. "Absent `search` argument" also covers the caller
who names no query channel at **all** — which is the arm every adapter's `<Link>`
takes, since `buildHref` forwards an absent search prop verbatim. Those calls lost
the route's `defaultSearch` from the URL, leaving `buildPath` the only producer
disagreeing with `navigate`, `makeState` and the `matchPath` rebuild:

```ts
// Route: { name: "x", path: "/x?page", defaultSearch: { page: "1" } }
router.buildPath("x"); // "/x?page=1"  (was: "/x")
router.buildPath("x", {}); // "/x?page=1"  (was: "/x")
(await router.navigate("x", {})).path; // "/x?page=1" — unchanged
```

So `<Link to="x">` rendered `href="/x"` while the click committed `/x?page=1`, and
the round trip broke in the sharp direction: `buildPath` emitted a URL `matchPath`
immediately rewrote into a different one. SSG manifests (`getStaticPaths`) dropped
the same queries.

The exemption now keys on the caller's **bag** rather than on the absence of the
argument — it applies only when a route-declared query name actually rides in
`params`, which is the single-bag shape the fallback exists to serve. Unchanged
and re-probed after the fix: a params-twin still outranks the default
(`buildPath("x", { page: "9" })` → `/x?page=9`), a route with no query default
keeps `search` `undefined` so the fallback still prints an undeclared key in
`loose`, and the `/coll/:id?id` collision stays path-owned (#843 / #1549).

The property tier gained the block that was missing: every other block reaches the
URL through a state builder that merges `defaultSearch` itself, which is why the
file's own measured map recorded "`buildPath` stops merging `defaultSearch` →
kills none". Block 8 draws the arm with no builder in front of `buildPath` and
dies on both mutations alone.
