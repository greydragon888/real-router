---
"@real-router/core": patch
---

perf: `isActiveRoute` stops touching the forward maps in a tree that has no `forwardTo` (#1595)

`isActiveRoute`'s second arm (#1573) is gated on "does this route forward?", asked
as two lookups in `config.forwardMap` / `config.forwardFnMap`. Both are
`Object.create(null)` objects, which V8 keeps in **dictionary mode** whatever their
size — empty ones included — and the pair measured ~14 ns. That was paid by every
route in the tree for a feature only forwarding routes use, on the shape that
reaches the gate: an **inactive** link, which is most links on a page.

The gate now asks a tree-wide question first: `RoutesStore.hasAnyForward`, one
boolean load. A tree with no `forwardTo` never touches the maps; a tree that has
one falls through to the same per-route check as before.

The cost was **not** the `Object.hasOwn` form — replacing it with a plain property
read measured identical — but touching the dictionaries at all. Two other
candidate mechanisms were built and measured null before this one: extracting the
arm's tail into its own method, and giving each arm a monomorphic
`#matchesActiveState` call site.

`hasAnyForward` is derived state, and a stale `false` would silently switch the arm
off — a `<Link>` to a forwarding route rendering inactive again, the defect #1573
exists to fix. It is therefore maintained only alongside `resolvedForwardMap`,
through a single `adoptForwardState` helper, and pinned across `add` / `update` /
`replace` / `clear` / dynamic-callback / never-forwards by six cases in
`isActiveRoute.test.ts` (mutationally validated: pinning the flag fails four of
them).

Measured against pre-pipeline `0fed89b` as medians of 9 alternating single-module
processes, A/A floor ≤ 1 %: `isActiveRoute` on an inactive link 44.3 → 32.9 ns
(−25.7 %), which is 1.75× → 1.29× of its pre-pipeline cost. No other arm moved.
