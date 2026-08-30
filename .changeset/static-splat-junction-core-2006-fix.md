---
"@real-router/core": minor
---

A dead-end static branch falls back to its splat sibling ([#2006](https://github.com/greydragon888/real-router/issues/2006))

The trie took a static child whenever the segment matched one, with no way back.
If the walk then ran out of path on a node carrying no route, the match failed —
even though a splat sibling at that same node would have captured the whole
remainder:

```ts
createRouter([
  { name: "deep", path: "/app/x" },
  { name: "all", path: "/*rest" },
]);

getPluginApi(r).matchPath("/app"); // undefined  ← should be `all`, rest="app"
```

Plain sibling routes, order-independent. Any app with a catch-all plus a nested
route silently 404s on the catch-all's own territory whenever a URL happens to
share a first segment with the nested route's prefix.

⚑ **The param half already existed.** `#traverseFrom` implements a validated
sub-traverse for the param+splat junction
([#1288](https://github.com/greydragon888/real-router/issues/1288), INVARIANTS
*"Matching #8 — param wins if its branch can complete"*): the branch is tried on
a scratch object and commits only if it structurally completes, otherwise the
splat captures. The STATIC+splat junction had no such fallback; it does now, in
the same shape.

⚠ **Behaviour change, and that is why this is `minor`:** a URL that used to
answer `undefined` can now match a catch-all. That is the catch-all doing what
it was declared for, but it is a routing change and an app relying on the 404
would see it.

⚑ Gated on the splat sibling EXISTING, so a static hop with no splat at that
node — the common case, and the hot path — pays one `undefined` check and
nothing more. Measured on 4000 distinct param URLs over a 40×3 tree: 1.1–1.2 µs
per `matchPath` before and after, inside the run's noise.

⚠ **The reported symptom was two coincidences away from this.** #2006 was filed
as *"`buildPath` and `matchPath` disagree on whether `~` escapes the root path"*,
because an absolute splat under `setRootPath("/app")` built `/app` and matched
nothing. `setRootPath` rebuilds the tree with the mount as the ROOT NODE, so the
mount contributes a static child, and `~` puts a splat beside it — the junction
above, reached by an unusual road. There is no build/match disagreement about
`~`, and no root-path special case in the fix.

Radius: core 4855 tests · 463 property · 100 % coverage, and all 22 consumer
packages green (6109 tests).
