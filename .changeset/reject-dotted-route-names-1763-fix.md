---
"@real-router/core": minor
---

fix(core): a route NAME carries no dot — bare core refuses the spelling its own validation layer already rejected ([#1763](https://github.com/greydragon888/real-router/issues/1763))

`createRouter`, `add` and `replace` now throw for a route definition whose own `name` contains a dot — `{ name: "users.view" }` where the nesting belongs in `children` or `{ parent }`:

```
[router.constructor] Route name "users.view" cannot contain dots. Use children array or { parent } option in addRoute() instead.
```

**Not a new rule.** The rule, the wording and the code are already in core — `engine/validation/route-batch.ts`'s `validateRouteName` — reachable only through `validateRoute`, which core exports FOR `@real-router/validation-plugin` and never calls itself. So the spelling was invalid under the project's own validation layer while bare core accepted it, and an app running `@real-router/validation-plugin` has been getting this exact error already — from `add`/`replace` since the plugin was extracted, and from the constructor since #1194 closed the retrospective half. This closes the asymmetry the same way #1047 closed it for the reserved `@@` prefix.

**Only a DEFINITION's own name.** A dotted name is still how a nested route is ADDRESSED — `get` / `update` / `remove` / `navigate` / `isActiveRoute` / `{ parent }` all take the full dotted form, and that boundary is pinned rather than left implied.

## Why a refusal instead of a fifth local fix

A dotted **leaf** is a standalone node whose name merely LOOKS like a path through the tree. Predicates across four packages read that resemblance as ancestry, and each read produced a different bug:

| reader | what it got wrong |
| --- | --- |
| `isActiveRoute` | reported a `<Link to="users">` **active** while the address bar showed `/view` (#1763) |
| `remove()`'s config purge | unregistered a **surviving** route's blocking `canActivate` — a fail-open (#1757) |
| `add({ parent })`, `buildPath` | the two halves of #1194 |
| `sources`' active-link fast path | the same wrong answer, on the path every adapter's plain `<Link>` actually takes |
| `route-utils`'s exported `areRoutesRelated`, `solid`'s `isRouteActive` | pure name algebra — **no tree to consult**, so no local fix can reach them |

The last row is why this shipped as a registration rule. `isActiveRoute` was fixed locally first and measured: the correction is free on the render path (6.4 ns lexical, 8.0 ns with a structural confirmation behind it, because the lexical prefix is a NECESSARY condition and an unrelated link short-circuits before the tree lookup). But that fix does not reach `sources`, and nothing can reach two readers that never see a router. Refusing to CREATE the shape makes every reader correct by construction — which is the one thing enumerating readers cannot do.

## Migration

Replace the dotted definition with nesting; the full dotted name is derived and unchanged, so nothing that *refers* to the route needs touching:

```diff
  createRouter([
-   { name: "users", path: "/users" },
-   { name: "users.view", path: "/:id" },
+   {
+     name: "users",
+     path: "/users",
+     children: [{ name: "view", path: "/:id" }],
+   },
  ]);

  router.navigate("users.view", { id: "1" }); // unchanged
```

⚠ Plain nesting also moves the URL: a flat `{ name: "users.view", path: "/view" }` mounted at `/view`, while a child of `users` mounts at `/users/view`. When the flat URL is the one you want, keep it with the **absolute** marker — the migration is then exact in both name and path:

```ts
// flat: name "users.view" at /view
createRouter([
  { name: "users", path: "/users", children: [{ name: "view", path: "~/view" }] },
]);
// → has("users.view") === true, buildPath("users.view") === "/view"
```

So every flat spelling has an exact equivalent, and the refusal costs no capability — only a rewrite.

`minor` rather than `patch`: pre-1.0, a rejection where core previously accepted is a breaking change, and the repo's convention routes those through `minor`.

**Radius, measured, all fixtures — no product code and no example.** 13 tests in core, 4 in `validation-plugin`, 8 in `lifecycle-plugin`, 10 in `vue`, migrated to `children`. The examples were already clean: their dotted names are all *references* (`navigate("products.detail")`, `use:link`), which stay legal.

⚠ **Six of #1757's cells are retired with it**, and that is the point rather than collateral: they pinned what `remove()` did to a flat dotted namesake, and that tree can no longer be built. #1757's fix stays in place — `spliceSubtree` still reports the names the splice actually took, and the removal guard still asks the matcher's segment chain — but its answer can no longer DIFFER from the cheap prefix form it replaced. The property that guarded it keeps all four of its assertions; only its generator changed, and the arm that used to emit the illegal spelling now emits an unrelated top-level route — which still discriminates the invariant that survives (a removal takes its own subtree and nothing else).
