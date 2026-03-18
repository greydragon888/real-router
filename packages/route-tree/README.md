# route-tree

> Named route tree with high-performance matching and path building.

**Internal package** — consumed by `@real-router/core`. Not published to npm.

## Purpose

Provides the core data structure that the router operates on: an immutable, pre-computed route tree with O(1) lookups. Bridges the gap between user-defined route definitions and the low-level `path-matcher` Segment Trie.

## Consumers

- `@real-router/core` — tree building, matching, path building, route CRUD
- `@real-router/route-utils` — tree traversal for ancestor chains and siblings (devDependency)

## Public API

### `createRouteTree(name, path, routes, options?)`

Creates an immutable route tree from route definitions. Pre-computes `fullName`, `staticPath`, `paramTypeMap`, and build templates.

```typescript
const tree = createRouteTree("", "", [
  { name: "home", path: "/" },
  { name: "users", path: "/users", children: [
    { name: "profile", path: "/:id" },
  ]},
]);
```

`options.skipFreeze` — skip `Object.freeze` (used in tests).

### `createMatcher(options?)`

Creates a path matcher with `search-params` DI baked in. Wraps `SegmentMatcher` from `path-matcher`.

```typescript
const matcher = createMatcher({ strictTrailingSlash: true });
matcher.registerTree(tree);

matcher.match("/users/123");
// → { segments, params: { id: "123" }, meta }

matcher.buildPath("users.profile", { id: "123" });
// → "/users/123"
```

Options: `caseSensitive`, `strictTrailingSlash`, `strictQueryParams`, `urlParamsEncoding`, `queryParams`.

### `getSegmentsByName(tree, routeName)`

O(1) Map lookup at each level of the dot-notation name.

### `validateRoute(route)`

Runtime validation of route definitions.

### `routeTreeToDefinitions(tree)` / `nodeToDefinition(node)`

Convert tree back to route definitions (used by `getRoutesApi`).

## Route Tree Node

```typescript
interface RouteTree {
  readonly name: string;                            // "profile"
  readonly fullName: string;                        // "users.profile"
  readonly path: string;                            // "/:id"
  readonly absolute: boolean;                       // path starts with "~"
  readonly children: ReadonlyMap<string, RouteTree>;// O(1) lookup by name
  readonly parent: RouteTree | null;
  readonly staticPath: string | null;               // pre-built for parameterless routes
  readonly paramTypeMap: Readonly<Record<string, "url" | "query">>;
  readonly nonAbsoluteChildren: readonly RouteTree[];
}
```

## Path Patterns

```
/users/:id          — URL parameter
/users/:id?         — optional parameter
/files/*path        — splat parameter
/search?q&page      — query parameters
/users/:id<\d+>     — constraint parameter
~admin              — absolute path (ignores parent)
```

## Matching Algorithm

1. **Static cache** — O(1) for parameterless routes
2. **Segment Trie traversal** — priority: static > param > splat
3. **Constraint validation** — regex patterns
4. **Parameter decoding** — percent-encoded values

## Dependencies

- `path-matcher` — Segment Trie URL matching and path building
- `search-params` — query string parsing and building

## License

[MIT](../../LICENSE)
