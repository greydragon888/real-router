# route-utils

Cached read-only query API for route tree structure. **Published** to npm — consumed by `@real-router/sources` (the `areRoutesRelated` pre-filter in `createActiveRouteSource` / `createActiveNameSelector`) and **all six framework adapters** (`@real-router/angular` · `preact` · `react` · `solid` · `svelte` · `vue` — `useRouteUtils`/`injectRouteUtils` + RouteView helpers), plus usable standalone. **Not** consumed by `@real-router/core`. A breaking change to `SegmentTestFunction` therefore ripples through the published surface of six adapters + sources, not "core internals."

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
- **Replace the root, don't mutate it in place** — the cache is keyed by root **identity**. Mutating a root object in place (e.g. pushing a child into its `nonAbsoluteChildren`) keeps the same key, so `getRouteUtils(root)` returns the **prior cached** `RouteUtils` — the new child is invisible (`getChain("newChild") → undefined`). This is **unreachable through core** (both route-CRUD paths rebuild the tree via `adoptRouteArtifacts`, so the root identity changes → WeakMap miss → fresh `RouteUtils`), but if you build trees by hand, construct a **new** root instead of mutating the old one.
- **All caches are pre-computed and frozen** — `getChain()` and `getSiblings()` return `Object.freeze`-d arrays built at construction time. No lazy computation.
- **`isDescendantOf` does not handle root** — `isDescendantOf(child, "")` returns `false` because `"users".startsWith(".")` is false. Root is a special case; every route is trivially a descendant of root.
- **Segment testers use regex caching** — Each segment string builds a `RegExp` once and caches it in a `Map`. Validated for length (`MAX_SEGMENT_LENGTH`) and character safety.
- **Segment testers accept `State` objects** — When passed a `State`, the `.name` property is extracted automatically.
- **`areRoutesRelated` is pure string comparison** — No tree lookup; O(k) where k is name length. Checks `===`, `startsWith(a + ".")`, or `startsWith(b + ".")`.
- **Structural `RouteTreeNode` type** — Defined locally to avoid runtime dependency on `route-tree`. Structurally compatible with `RouteTree`.
