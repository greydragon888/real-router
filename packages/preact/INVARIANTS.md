# @real-router/preact — Invariants

Invariants verified by property-based tests in `tests/property/`.

## areLinkPropsEqual (Link memo comparator)

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Reflexivity** — `areLinkPropsEqual(p, p) === true` | Prevents unnecessary re-renders when props haven't changed |
| 2 | **Symmetry** — `areLinkPropsEqual(a, b) === areLinkPropsEqual(b, a)` | Comparison order must not affect memoization decisions |
| 3 | **Structural equality** — identical fields yield `true` (even fresh objects) | `JSON.stringify` for `routeParams`/`routeOptions` enables inline objects in JSX without breaking memo |
| 4 | **Sensitivity** — differing any compared field yields `false` | Ensures Link re-renders when meaningful props change |

## isSegmentMatch (RouteView helper)

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Exact self-match** — `isSegmentMatch(name, name, true) === true` | A route must always match itself in exact mode |
| 2 | **Exact mismatch** — `isSegmentMatch(a, b, true) === false` when `a !== b` | Exact mode must reject different names |
| 3 | **Parent prefix matches child** — `isSegmentMatch("parent.child", "parent", false) === true` | Non-exact mode must recognize ancestor relationships |
| 4 | **Child does not match parent** — `isSegmentMatch("parent", "parent.child", false) === false` | A parent route name cannot start with a child's longer name |
