---
"@real-router/core": minor
---

Build the URL a splat-with-child route actually matches (#1568)

A splat node's children are matched at the splat's **own** position, so the splat
captures nothing for them — that is INVARIANTS Matching #24, shipped and stress-
tested. `buildPath` did not mirror it: it demanded a value for the splat and
printed it, producing a URL that could not resolve back to the route it was built
for. The route named in the invariant's own example could not be built at all:

```ts
createRouter([
  { name: "n", path: "/n", children: [
    { name: "all", path: "/*rest", children: [{ name: "edit", path: "/edit" }] },
  ]},
]);

router.buildPath("n.all.edit", {});
// before: throws — Missing required param 'rest'
// now:    "/n/edit"   ← the URL Matching #24 says resolves to n.all.edit
```

With a value supplied the built URL silently resolved to the **parent**:
`buildPath("n.all.edit", { rest: "x" })` gave `/n/x/edit`, which the wildcard
swallowed whole (`n.all`, `rest: "x/edit"`).

**The rule is now one line: a splat binds only as the final segment of a route's
assembled path; every earlier one builds as empty.** "Assembled" spans the route's
own path (`/a/*rest/b` → `/a/b`), the parent chain (a child under a splat parent),
and `setRootPath("/app/*rest")` — all three produced the same defect and all three
round-trip now. A terminal splat is untouched: `buildPath("n.all", { rest: "x/y" })`
is still `/n/x/y`.

**Behaviour change:** such a route no longer requires the splat param, and a value
passed for it is no longer placed in the path (under `queryParamsMode: "loose"` it
becomes a query extra, the same treatment any non-slot param gets). Nothing in the
repo built such a URL except one test asserting the broken string.

Locked by a name-roundtrip property (`roundtrip.properties.ts`) — "matches
something" is too weak, because the broken build *did* match, just the wrong route.
