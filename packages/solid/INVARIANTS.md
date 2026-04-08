# @real-router/solid — Invariants

Invariants verified by property-based tests in `tests/property/`.

## isRouteActive (RouterProvider selector)

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Exact match** — `isRouteActive("X", "X") === true` | A link's own route must always be considered active |
| 2 | **Ancestor match** — `isRouteActive("parent", "parent.child") === true` | Parent links stay active when a child route is current (breadcrumb/nav highlighting) |
| 3 | **Non-ancestor prefix** — `isRouteActive("users", "users2") === false` | String prefix without dot boundary must NOT be treated as ancestor |
| 4 | **Reverse NOT true** — `isRouteActive("parent.child", "parent") === false` | A child link must NOT be active when only the parent is current |
| 5 | **Self-match** — `isRouteActive(name, name) === true` for any name | Redundant with #1 but tested with random dotted names for robustness |

## isSegmentMatch (RouteView helper)

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Exact self-match** — `isSegmentMatch(name, name, true) === true` | A route must always match itself in exact mode |
| 2 | **Exact mismatch** — `isSegmentMatch(a, b, true) === false` when `a !== b` | Exact mode must reject different names |
| 3 | **Parent prefix matches child** — `isSegmentMatch("parent.child", "parent", false) === true` | Non-exact mode must recognize ancestor relationships |
| 4 | **Child does not match parent** — `isSegmentMatch("parent", "parent.child", false) === false` | A parent route name cannot start with a child's longer name |
