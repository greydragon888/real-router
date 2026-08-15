---
"@real-router/core": patch
---

fix(core): `replace()`'s revalidation refuses to commit a state whose URL its own window moved ([#1753](https://github.com/greydragon888/real-router/issues/1753), [#1754](https://github.com/greydragon888/real-router/issues/1754))

`getRoutesApi(router).replace(routes)` could commit a state for a route that no longer existed — silently, with a clean `TRANSITION_SUCCESS` and no error. `router.getState().name` named a route `getRoutesApi(router).has(name)` answered `false` for.

The revalidation is the **third** commit door, and it was the one without the question the other two ask. `completeTransition` and `navigateToState` both refuse a state whose route is gone. This path went through `systemCommit`, whose question is a different one and deliberately so — "may the MACHINE commit", an edge declared on `READY` alone, which refuses even a perfectly live router that is merely starting or mid-transition. It is not a route check and was never meant to be one, so nothing on this path asked about the route at all.

The window is real on **both** revalidation arms, because both run application code between the matching and the commit:

- the **survivor** arm through the route's own `decodeParams`, invoked by the revalidating `matchPath`;
- the **route-identity** arm additionally through the new route's activation guards, consulted since #1201.

Either can reach back into route-CRUD — no navigation is in flight and the `TREE_CHANGED` dispatch has already returned.

## What the door asks

**Who OWNS the URL, asked as a difference.** The raw matcher is asked who owns the committed path before the window's own code runs, and again at the commit; the commit is refused only when that answer **changed**.

```ts
const router = createRouter([{ name: "a", path: "/x" }], {
  allowNotFound: true,
});
await router.start("/x");

getLifecycleApi(router).addActivateGuard("b", () => () => {
  getRoutesApi(router).remove("b"); // delete the route being revalidated into
  return true;
});

getRoutesApi(router).replace([{ name: "b", path: "/x" }]);

// was "b" — a route `has("b")` answers false for; now UNKNOWN_ROUTE
router.getState().name;
```

A refusal takes the arm this function already had for "the URL no longer belongs to a route we can commit": `navigateToNotFound(currentPath, { skipDeactivation: true })`, i.e. `UNKNOWN_ROUTE` + `TRANSITION_SUCCESS`, the same thing it does when the active route is simply absent from the new tree. The second argument is load-bearing and matches the sibling arms: without it the fall-through could throw `CANNOT_DEACTIVATE` out of a route-CRUD call, a shape #1643 kept for user-initiated departures only.

## Why ownership, and why a difference

Two weaker forms were built first, and each was measured failing:

**`hasRoute(state.name)`** closes "the route is gone" and nothing else. The NAME is the one field of the state being committed that the window can leave untouched while invalidating everything around it — so the route survived and `replace()` still committed a state whose own `path` the live tree no longer routed to it. Three shapes, all measured, none of them caught by an existence check:

| what the code in the window does                     | committed state   | `buildPath(name)` | who owns `state.path` |
| ---------------------------------------------------- | ----------------- | ----------------- | --------------------- |
| nested `replace()` keeping the NAME, moving the path | `victim` @ `/x`   | `/moved`          | nobody                |
| `setRootPath("/app")` from the consulted guard       | `victim` @ `/x`   | `/app/x`          | nobody                |
| `add()` of a more specific route on the same URL     | `u` @ `/users/me` | `/users/me`       | **a different route** |

Ownership **subsumes** existence — a name the matcher hands back is a name the matcher holds — so it replaced that check rather than joining it.

**Ownership as an EQUALITY** (does `state.path` still resolve to `state.name`) was a regression, and this is the part worth carrying forward: it presumes the committed path belongs to the committed name, and two shipped configurations break that presumption **on purpose**. `rewritePathOnMatch: false` keeps the URL verbatim while still resolving a `forwardTo`, and the #1157 rebuild fallback does the same on DEFAULT options when the target's path cannot be built — both commit `{ terminal, sourceUrl }` deliberately, and both were measured landing `UNKNOWN_ROUTE` on **every** `replace()`, healthy tree, no application code involved. Reachable through `start(url)` and popstate, i.e. every deep link and every SSR hydration. Comparing against a snapshot needs no such presumption: a state whose path never belonged to its name keeps a stable answer and commits.

Nothing about a healthy revalidation changes. The raw matcher runs **no application code** — the route's `decodeParams`, the `forwardState` seam and the encoders all sit above it, and the matcher's own decode and query hooks are built inside `createMatcher` from option flags rather than from any caller's function — so the check cannot re-open the window it guards. It is asked at most once per `replaceRoutes` frame, on a path no benchmark touches.

## Boundaries, stated because they are deliberate

- **A `forwardTo` installed inside the window is not caught.** It changes who the URL *resolves* to without changing who it *matches*, and resolving the chain would mean running dynamic `forwardTo` callbacks and plugin interceptors — application code, inside the predicate meant to guard against application code. The same divergence is reachable with no window at all, since `update()` is documented not to revalidate.
- **The door asks about the URL the state came in on.** When the revalidation *rebuilds* the path (a `forwardTo` chain, a `defaultParams` filling a slot), a route the window adds can take over that rebuilt URL and the commit stands. Tracked as [#1758](https://github.com/greydragon888/real-router/issues/1758), together with the `params` half of the question — a window that re-declares the same name with a different slot leaves a committed bag its own route can no longer build from.
- **A navigation left in flight by the window's own code is fatal, not superseded.** The commit primitive has no edge to take, so `replace()` throws `NOT_STARTED` on a started router — on **both** exits of this door — with the tree already swapped, the committed state stale and no event emitted. That is unchanged by this fix and tracked as [#1759](https://github.com/greydragon888/real-router/issues/1759).
- **The refused commit loses the `revalidate: true` marker.** `commitRevalidated` emits `{ replace: true, revalidate: true }` (#1201); the fall-through goes through `navigateToNotFound`, which emits `{ replace: true }`. A plugin's `onTransitionSuccess` sees a plain 404 rather than a revalidation — as it already did for the other two arms.

Unchanged: an activation guard that blocks, one that removes an unrelated route, an async guard (which could never be answered synchronously and already reached not-found), and a `clear()` from a guard (which throws `ROUTER_NOT_STOPPED` on its own). The option `allowNotFound` never gated this and still does not.

The site set is derived and pinned rather than listed: `commit-door-authority-1753.test.ts` walks `src` for CALLS to a commit primitive, requires the strongest form per door, holds the DI plumbing to "forwards only what it was handed", and asserts the resulting set exactly — so a fourth door cannot ship without the question, and an existing one cannot quietly disappear either.
