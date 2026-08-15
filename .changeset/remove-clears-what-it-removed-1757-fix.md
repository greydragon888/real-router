---
"@real-router/core": patch
---

fix(core): `remove()` clears exactly the routes it removed — a surviving route no longer loses its guards ([#1757](https://github.com/greydragon888/real-router/issues/1757))

`getRoutesApi(router).remove(name)` decided what to clean up by testing the name STRING — `n === name || n.startsWith(name + ".")` — while the removal itself splices one node and its real `children`. Core accepts a dotted **leaf**, so `{ name: "a.b" }` declared beside `{ name: "a" }` is a **standalone** route: the splice never touches it, and the prefix test claimed it anyway.

The sharpest consequence is a **fail-open**. A route that survives the removal had its lifecycle handlers unregistered, so a blocking `canActivate` silently disappeared — measured, with no log of any kind:

| after `remove("x")`, with a flat `{ name: "x.y" }` beside `{ name: "x" }` | before | after |
| --- | --- | --- |
| `has("x.y")` | `true` — survives, as it should | `true` |
| `navigate("x.y")` with a blocking guard | **`RESOLVED`** | `CANNOT_ACTIVATE` |
| `get("x.y").defaultParams` | **`undefined`** | `{ … }` |
| a third route's `forwardTo: "x.y"` | **cleared** | kept |
| `TREE_CHANGED` `removedSubtree` | **`["x", "x.y"]`** — a live route announced as removed | `["x"]` |
| `remove("x")` while standing on `x.y` | **refused**, `it is currently active (current: "x.y")` | proceeds |
| `remove("x")` when `x` is not a route, while standing on `x.y` | **`currently active`** | `not found` |

The last row is a second symptom of the same predicate: the active-route refusal runs above the existence check, so a name that was not a route at all was reported as active rather than missing.

**The rule is now one question asked of the TREE.** The definitions splice reports the full dotted names it actually took (`spliceSubtree`), and that set drives the config purge, the lifecycle purge, the `forwardMap` sweep and the `TREE_CHANGED` payload. The active-route refusal asks the matcher's segment chain for the committed route and blocks exactly when it contains `name` — which is what "or an ancestor of it" always meant.

Nothing changes for a well-formed tree: a real child still goes with its parent, with its config, its guards and its place in the payload; a non-dot namesake (`x-protected`) was never affected and still is not. Both are pinned as controls.

⚠ One observable change beyond the defect, and it is the same rule applied honestly: an EXTERNAL guard registered for a name that is not a route (`addActivateGuard("x.ghost")`) used to be swept by `remove("x")` and now survives it — so a later `add({ name: "x.ghost" })` binds to it, exactly as it would have without the removal. That is the documented behaviour of an external guard registered before its route; what was anomalous was an unrelated removal silently dropping it. It also means such a guard keeps occupying a `maxLifecycleHandlers` slot (#961) until it is removed explicitly.

⚠ The same lexical assumption lives on in `isActiveRoute` and in `transition.segments`, both outside this fix's surface: standing on a flat `x.y`, `isActiveRoute("x")` answers `true` and `segments.activated` reads `["x", "x.y"]` for routes that are not related. `isActiveRoute` is deliberately NOT converted here, and that is measured rather than asserted: the structural form costs **60.2 ns** against the lexical **7.6 ns** it would replace, i.e. **+52.6 ns** on a predicate whose whole measured cost for an inactive link is 32.9 ns. Closing it needs a cheap gate (the `hasAnyForward` shape of #1595), not a lookup on every `<Link>` render. Tracked separately.
