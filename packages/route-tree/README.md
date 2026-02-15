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

- **O(1) route lookup** — `children` Map for instant access by name
- **Segment Trie matching** — custom Segment Trie via `path-matcher` for O(segments) URL matching
- **Static route cache** — parameterless routes resolved in O(1) via hash map
- **Pre-computed caches** — `staticPath`, `fullName`, `paramTypeMap`
- **Pre-compiled buildPath** — `buildStaticParts` + `buildParamSlots` for fast URL generation
- **Lazy allocation** — arrays created only when needed
- **Immutable by default** — frozen trees prevent accidental mutations

### Route Tree Structure

```typescript
interface RouteTree {
  // Core
  readonly name: string; // "users"
  readonly path: string; // "/users/:id"
  readonly absolute: boolean; // path starts with "~"
  readonly children: ReadonlyMap<string, RouteTree>; // Map for O(1) lookup by name

  // Pre-computed caches
  readonly parent: RouteTree | null;
  readonly fullName: string; // "users.profile"
  readonly staticPath: string | null; // pre-built for parameterless routes
  readonly paramTypeMap: Readonly<Record<string, "url" | "query">>;
  readonly paramMeta: ParamMeta; // parameter metadata
  readonly nonAbsoluteChildren: readonly RouteTree[];
}
```

## API

### `createRouteTree(name, path, routes, options?)`

Creates an immutable route tree from route definitions.

```typescript
import { createRouteTree } from "route-tree";

const tree = createRouteTree("", "", [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [
      {
        name: "profile",
        path: "/:id",
        children: [{ name: "edit", path: "/edit" }],
      },
    ],
  },
]);
```

**Options:**

```typescript
interface TreeBuildOptions {
  skipFreeze?: boolean; // Skip Object.freeze
}
```

---

### `createMatcher(options?)`

Creates a path matcher with search-params DI baked in. Returns a `Matcher` instance wrapping the `SegmentMatcher` from `path-matcher`.

```typescript
import { createMatcher, createRouteTree } from "route-tree";

const tree = createRouteTree("", "", [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
  { name: "search", path: "/search?q&page" },
]);

const matcher = createMatcher({
  strictTrailingSlash: true,
  queryParams: { booleanFormat: "string" },
});

matcher.registerTree(tree);

// Match URL to route
const result = matcher.match("/users/123");
// → { segments, params: { id: "123" }, meta }

// Build URL from route name
matcher.buildPath("users.profile", { id: "123" });
// → "/users/123"

// Build with query params
matcher.buildPath("search", { q: "router", page: 1 });
// → "/search?q=router&page=1"
```

**Options:**

```typescript
interface CreateMatcherOptions {
  caseSensitive?: boolean; // default: true
  strictTrailingSlash?: boolean; // default: false
  strictQueryParams?: boolean; // default: false
  urlParamsEncoding?: "default" | "uri" | "uriComponent" | "none";
  queryParams?: QueryParamsConfig;
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

### `validateRoute(route)`

Validates a route definition at runtime.

```typescript
import { validateRoute } from "route-tree";

validateRoute({ name: "users", path: "/users" }); // OK
validateRoute({ name: "123bad", path: "/path" }); // throws
validateRoute({ name: "test", path: "//double" }); // throws
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

  // Matcher types
  CreateMatcherOptions,
  Matcher,
  QueryParamsConfig,

  // Options
  BuildOptions,
  MatchOptions,

  // Results
  MatchResult,
  RouteTreeState,
  RouteTreeStateMeta,
  RouteParams,

  // Mode types
  TrailingSlashMode,
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

### Constraint Parameters

```typescript
{ name: "user", path: "/users/:id<\\d+>" }
// Matches: /users/123
// Does NOT match: /users/abc
```

### Absolute Paths

```typescript
{
  name: "users",
  path: "/users",
  children: [
    { name: "admin", path: "~admin" }  // Absolute: matches /admin, not /users/admin
  ]
}
```

## Architecture

### Build Pipeline

1. **Validation** — validate route definitions
2. **Tree Building** — create mutable tree structure
3. **Cache Computing** — compute all lookup caches
4. **Freezing** — make tree immutable

### Matching Algorithm

Route matching is powered by a custom Segment Trie (via `path-matcher`):

1. **Static Cache Check** — O(1) lookup for parameterless routes
2. **Segment Trie Traversal** — walk trie segment-by-segment with priority: static > param > splat
3. **Parameter Extraction** — capture URL parameters during traversal
4. **Constraint Validation** — validate params against regex constraints
5. **Decoding** — decode percent-encoded parameter values

```
/users/123/edit
  ↓
Static cache miss → traverse Segment Trie
  ↓
Walk: root → "users" (static) → "123" (param :id) → "edit" (static)
  ↓
Extract params: { id: "123" }
  ↓
Build segments: [usersNode, profileNode, editNode]
```

## Dependencies

- `path-matcher` — Segment Trie URL matching and path building (internal package)
- `search-params` — query string parsing and building (internal package)

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — core router (uses route-tree internally)

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
