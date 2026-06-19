# route-utils

Cached read-only query API for route tree structure. Published to npm (consumed by `@real-router/core`, and usable standalone).

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `RouteUtils` | class | Cached route tree queries (chain, siblings, descendant check) |
| `getRouteUtils(root)` | function | WeakMap-cached factory — returns `RouteUtils` for a tree root |
| `startsWithSegment(route, segment?)` | function | Tests if route name starts with segment; supports currying and `State` objects |
| `endsWithSegment(route, segment?)` | function | Tests if route name ends with segment; supports currying and `State` objects |
| `includesSegment(route, segment?)` | function | Tests if route name includes segment anywhere; supports currying and `State` objects |
| `areRoutesRelated(a, b)` | function | Checks if two routes are same, parent-child, or child-parent |
| `SegmentTestFunction` | type | Overloaded signature for segment testers (direct, curried, null) |

## Module Structure

```
src/
├── RouteUtils.ts        — RouteUtils class (chain/siblings caches, isDescendantOf)
├── getRouteUtils.ts     — WeakMap-cached factory for RouteUtils
├── segmentTesters.ts    — startsWithSegment, endsWithSegment, includesSegment (regex-cached)
├── routeRelation.ts     — areRoutesRelated (string prefix comparison)
├── constants.ts         — MAX_SEGMENT_LENGTH, ROUTE_SEGMENT_SEPARATOR, SAFE_SEGMENT_PATTERN
├── types.ts             — RouteTreeNode (structural interface), SegmentTestFunction
└── index.ts             — public re-exports
```

## Gotchas

- **`getRouteUtils` is WeakMap-cached** — same `RouteTreeNode` root always returns the same `RouteUtils` instance. No manual cache invalidation needed; GC handles cleanup when the tree is replaced.
- **All caches are pre-computed and frozen** — `getChain()` and `getSiblings()` return `Object.freeze`-d arrays built at construction time. No lazy computation.
- **`isDescendantOf` does not handle root** — `isDescendantOf(child, "")` returns `false` because `"users".startsWith(".")` is false. Root is a special case; every route is trivially a descendant of root.
- **Segment testers use regex caching** — Each segment string builds a `RegExp` once and caches it in a `Map`. Validated for length (`MAX_SEGMENT_LENGTH`) and character safety.
- **Segment testers accept `State` objects** — When passed a `State`, the `.name` property is extracted automatically.
- **`areRoutesRelated` is pure string comparison** — No tree lookup; O(k) where k is name length. Checks `===`, `startsWith(a + ".")`, or `startsWith(b + ".")`.
- **Structural `RouteTreeNode` type** — Defined locally to avoid runtime dependency on `route-tree`. Structurally compatible with `RouteTree`.
