# route-tree

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

Named route tree with high-performance matching and path building for Router6.

**⚠️ Internal Use Only:** This package is designed for use within the Router6 ecosystem. External users should use `router6` package directly.

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
  name: string;                    // "users"
  path: string;                    // "/users/:id"
  absolute: boolean;               // path starts with "~"
  parser: PathParser | null;       // path parser
  children: readonly RouteTree[];

  // Pre-computed caches
  parent: RouteTree | null;
  fullName: string;                // "users.profile"
  staticPath: string | null;       // pre-built for parameterless routes
  childrenByName: Map<string, RouteTree>;
  staticChildrenByFirstSegment: Map<string, RouteTree[]>;
  paramTypeMap: Record<string, "url" | "query">;
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

- `search-params` — query string parsing and building

## Related Packages

- [router6](https://www.npmjs.com/package/router6) — core router (uses route-tree internally)
- [search-params](https://www.npmjs.com/package/search-params) — query string utilities

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
