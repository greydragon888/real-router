# @real-router/vue — Invariants

Invariants verified by property-based tests in `tests/property/`.

## isSegmentMatch (RouteView helper)

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Exact self-match** — `isSegmentMatch(name, name, true) === true` | A route must always match itself in exact mode |
| 2 | **Exact mismatch** — `isSegmentMatch(a, b, true) === false` when `a !== b` | Exact mode must reject different names |
| 3 | **Parent prefix matches child** — `isSegmentMatch("parent.child", "parent", false) === true` | Non-exact mode must recognize ancestor relationships |
| 4 | **Child does not match parent** — `isSegmentMatch("parent", "parent.child", false) === false` | A parent route name cannot start with a child's longer name |
