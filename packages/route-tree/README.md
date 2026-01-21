# route-tree

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

Named route tree with high-performance matching and path building for Real-Router.

**⚠️ Internal Use Only:** This package is designed for use within the Real-Router ecosystem. External users should use `@real-router/core` package directly.

## Overview

`route-tree` provides the core route tree data structure and operations:

- **Route tree building** — create immutable route trees from definitions
- **Path matching** — match URLs to routes with O(1) static segment lookup
- **Path building** — build URLs from route names and parameters
- **Validation** — validate route definitions at build time

## Features

### Performance Optimizations

- **O(1) route lookup** — `childrenByName` Map for instant access by name
- **O(1) static segment matching** — `staticChildrenByFirstSegment` index
- **Pre-computed caches** — `staticPath`, `fullName`, `paramTypeMap`
- **Lazy allocation** — arrays created only when needed
- **Immutable by default** — frozen trees prevent accidental mutations

### Route Tree Structure

```typescript
interface RouteTree {
  // Core
  readonly name: string;                    // "users"
  readonly path: string;                    // "/users/:id"
  readonly absolute: boolean;               // path starts with "~"
  readonly parser: PathParser | null;       // path parser
  readonly children: readonly RouteTree[];

  // Pre-computed caches
  readonly parent: RouteTree | null;
  readonly fullName: string;                // "users.profile"
  readonly staticPath: string | null;       // pre-built for parameterless routes
  readonly childrenByName: ReadonlyMap<string, RouteTree>;
  readonly staticChildrenByFirstSegment: ReadonlyMap<string, readonly RouteTree[]>;
  readonly paramTypeMap: Readonly<Record<string, "url" | "query">>;

  // Additional caches
  readonly nonAbsoluteChildren: readonly RouteTree[];
  readonly absoluteDescendants: readonly RouteTree[];
  readonly parentSegments: readonly RouteTree[];
}
```

## API

### `createRouteTree(name, path, routes, options?)`

Creates an immutable route tree from route definitions.

```typescript
import { createRouteTree } from "route-tree";

const tree = createRouteTree("", "", [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
  { name: "users.profile", path: "/:id" },
  { name: "users.profile.edit", path: "/edit" },
]);
```

**Options:**

```typescript
interface TreeBuildOptions {
  skipValidation?: boolean;  // Skip route validation
  skipSort?: boolean;        // Skip children sorting
  skipFreeze?: boolean;      // Skip Object.freeze
}
```

---

### `matchSegments(tree, path, options?)`

Matches a URL path against the route tree.

```typescript
import { matchSegments } from "route-tree";

const result = matchSegments(tree, "/users/123/edit");
// → {
//     segments: [usersNode, profileNode, editNode],
//     params: { id: "123" }
//   }
```

**Options:**

```typescript
interface MatchOptions {
  trailingSlashMode?: "default" | "never" | "always";
  strictTrailingSlash?: boolean;  // Require exact trailing slash match
  caseSensitive?: boolean;        // Case-sensitive matching
  strongMatching?: boolean;       // Strict segment boundaries
  queryParamsMode?: "default" | "strict" | "loose";
  queryParams?: QueryParamsOptions;
  urlParamsEncoding?: "default" | "uri" | "uriComponent" | "none" | "legacy";
}
```

---

### `buildPath(tree, routeName, params?, options?)`

Builds a URL path from route name and parameters.

```typescript
import { buildPath } from "route-tree";

buildPath(tree, "users.profile", { id: "123" });
// → "/users/123"

buildPath(tree, "users.profile.edit", { id: "123" });
// → "/users/123/edit"

// With query params
buildPath(tree, "search", { q: "router", page: 1 });
// → "/search?q=router&page=1"
```

**Options:**

```typescript
interface BuildOptions {
  trailingSlashMode?: "default" | "always" | "never";
  queryParamsMode?: "default" | "strict" | "loose";
  queryParams?: QueryParamsOptions;
  urlParamsEncoding?: "default" | "uri" | "uriComponent" | "none" | "legacy";
}
```

---

### `getSegmentsByName(tree, routeName)`

Finds route segments by dot-notation name. Uses O(1) Map lookup at each level.

```typescript
import { getSegmentsByName } from "route-tree";

const segments = getSegmentsByName(tree, "users.profile");
// → [usersNode, profileNode]
```

---

### `hasSegmentsByName(tree, routeName)`

Checks if a route exists (more efficient than `getSegmentsByName` when only checking existence).

```typescript
import { hasSegmentsByName } from "route-tree";

hasSegmentsByName(tree, "users.profile");  // true
hasSegmentsByName(tree, "unknown.route");  // false
```

---

### `getMetaFromSegments(segments, params)`

Extracts metadata from matched segments.

```typescript
import { getMetaFromSegments, matchSegments } from "route-tree";

const match = matchSegments(tree, "/users/123");
const meta = getMetaFromSegments(match.segments, match.params);
// → { params: { id: "123" }, ... }
```

---

### `validateRoute(route)`

Validates a route definition at runtime.

```typescript
import { validateRoute } from "route-tree";

validateRoute({ name: "users", path: "/users" });     // OK
validateRoute({ name: "123bad", path: "/path" });     // throws
validateRoute({ name: "test", path: "//double" });    // throws
```

---

### `routeTreeToDefinitions(tree)`

Converts a route tree back to route definitions.

```typescript
import { routeTreeToDefinitions } from "route-tree";

const definitions = routeTreeToDefinitions(tree);
// → [{ name: "home", path: "/" }, { name: "users", path: "/users", children: [...] }]
```

---

### `nodeToDefinition(node)`

Converts a single route tree node to a route definition.

```typescript
import { nodeToDefinition } from "route-tree";

const definition = nodeToDefinition(usersNode);
// → { name: "users", path: "/users", children: [...] }
```

## Type Exports

```typescript
import type {
  // Core types
  RouteTree,
  RouteDefinition,

  // Options
  BuildOptions,
  MatchOptions,
  TreeBuildOptions,

  // Results
  MatchResult,
  RouteTreeState,
  RouteTreeStateMeta,
  RouteParams,

  // Mode types
  TrailingSlashMode,
  QueryParamsMode,
  URLParamsEncodingType,
} from "route-tree";
```

## Path Patterns

### URL Parameters

```typescript
{ name: "user", path: "/users/:id" }
// Matches: /users/123, /users/abc
// Params: { id: "123" }
```

### Optional Parameters

```typescript
{ name: "user", path: "/users/:id?" }
// Matches: /users, /users/123
```

### Splat Parameters

```typescript
{ name: "files", path: "/files/*path" }
// Matches: /files/a/b/c
// Params: { path: "a/b/c" }
```

### Query Parameters

```typescript
{ name: "search", path: "/search?q&page" }
// Matches: /search?q=term&page=1
// Params: { q: "term", page: "1" }
```

### Absolute Paths

```typescript
{ name: "users", path: "/users" },
{ name: "users.admin", path: "~admin" }  // Absolute: matches /admin, not /users/admin
```

## Architecture

### Build Pipeline

1. **Validation** — validate route definitions
2. **Tree Building** — create mutable tree structure
3. **Sorting** — sort children for correct matching order
4. **Cache Computing** — compute all lookup caches
5. **Freezing** — make tree immutable

### Matching Algorithm

1. **Static Index Lookup** — O(1) lookup by first path segment
2. **Dynamic Fallback** — linear search for parameterized routes
3. **Recursive Descent** — match remaining path against children

```
/users/123/edit
  ↓
staticChildrenByFirstSegment.get("users") → [usersNode]
  ↓
Match usersNode, remaining: /123/edit
  ↓
Dynamic fallback: /:id → profileNode
  ↓
Match profileNode, remaining: /edit
  ↓
staticChildrenByFirstSegment.get("edit") → [editNode]
  ↓
Match complete: [usersNode, profileNode, editNode]
```

## Dependencies

- `search-params` — query string parsing and building (internal package)

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — core router (uses route-tree internally)

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
