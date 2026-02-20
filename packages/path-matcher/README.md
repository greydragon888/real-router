# path-matcher

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

> Segment Trie URL matching and path building for Real-Router.

**⚠️ Internal Use Only:** This package is designed for use within the Real-Router monorepo. External users should use `@real-router/core` package directly.

## Overview

`path-matcher` provides the low-level URL matching engine:

- **Segment Trie matching** — O(segments) URL matching with priority: static > param > splat
- **Path building** — build URLs from route names and pre-compiled templates
- **Constraint validation** — regex constraints on URL parameters
- **Parameter encoding/decoding** — configurable strategies (`default`, `uri`, `uriComponent`, `none`)
- **Static route cache** — O(1) lookup for parameterless routes

## API

### `new SegmentMatcher(options?)`

Creates a segment-based URL matcher.

```typescript
import { SegmentMatcher } from "path-matcher";

const matcher = new SegmentMatcher({
  caseSensitive: true,
  strictTrailingSlash: false,
  strictQueryParams: false,
  urlParamsEncoding: "default",
});
```

**Options:**

```typescript
interface SegmentMatcherOptions {
  caseSensitive?: boolean;        // default: true
  strictTrailingSlash?: boolean;  // default: false
  strictQueryParams?: boolean;    // default: false
  urlParamsEncoding?: URLParamsEncodingType;  // default: "default"
  queryParams?: Record<string, unknown>;     // DI for query string parsing
}
```

---

### `matcher.registerTree(node)`

Registers a route tree into the trie. Recursively walks the tree, compiles routes, and populates the static cache.

```typescript
matcher.registerTree(routeTreeRoot);
```

---

### `matcher.match(path)`

Matches a URL path against registered routes. Returns `null` if no match.

```typescript
const result = matcher.match("/users/123/edit");
// → {
//     segments: [usersNode, profileNode, editNode],
//     params: { id: "123" },
//     meta: { ... }
//   }
```

**Matching algorithm:**

1. Static cache check — O(1) for parameterless routes
2. Segment Trie traversal — priority: static > param > splat
3. Trailing slash validation
4. Constraint validation — regex patterns on params
5. Parameter decoding — percent-encoded values

---

### `matcher.buildPath(name, params?, options?)`

Builds a URL from a route name and parameters using pre-compiled templates.

```typescript
matcher.buildPath("users.profile", { id: "123" });
// → "/users/123"

matcher.buildPath("search", { q: "router", page: 1 });
// → "/search?q=router&page=1"
```

**Options:**

```typescript
interface BuildPathOptions {
  queryParamsMode?: "default" | "strict" | "loose";
  trailingSlash?: "never" | "always";
}
```

---

### `matcher.hasRoute(name)`

Returns `true` if a route with the given name is registered.

---

### `matcher.getSegmentsByName(name)`

Returns the segment chain for a route, or `undefined` if not found.

---

### `matcher.getMetaByName(name)`

Returns the metadata object for a route, or `undefined` if not found.

---

### `buildParamMeta(path)`

Extracts parameter metadata from a raw route path string.

```typescript
import { buildParamMeta } from "path-matcher";

const meta = buildParamMeta("/users/:id<\\d+>?q&page");
// → {
//     urlParams: ["id"],
//     queryParams: ["q", "page"],
//     spatParams: [],
//     paramTypeMap: { id: "url", q: "query", page: "query" },
//     constraintPatterns: Map { "id" → { pattern: /^\d+$/, constraint: "\\d+" } },
//     pathPattern: "/users/:id"
//   }
```

---

### `validateConstraints(params, constraintPatterns, path)`

Validates parameter values against constraint regex patterns. Throws on mismatch.

```typescript
import { validateConstraints } from "path-matcher";

validateConstraints(
  { id: "123" },
  constraintPatterns,
  "/users/:id<\\d+>",
); // OK

validateConstraints(
  { id: "abc" },
  constraintPatterns,
  "/users/:id<\\d+>",
); // throws
```

---

### `createSegmentNode()`

Creates an empty trie node.

---

### Encoding utilities

```typescript
import {
  encodeParam,
  encodeURIComponentExcludingSubDelims,
  ENCODING_METHODS,
  DECODING_METHODS,
} from "path-matcher";
```

- `encodeParam(param, encoding, isSplatParam)` — encodes a parameter value with the given strategy
- `ENCODING_METHODS` / `DECODING_METHODS` — maps of `URLParamsEncodingType` to encoder/decoder functions

## Path Patterns

### URL Parameters

```
/users/:id         → { id: "123" }
```

### Optional Parameters

```
/users/:id?        → matches /users and /users/123
```

### Splat Parameters

```
/files/*path       → { path: "a/b/c" }
```

### Constraint Parameters

```
/users/:id<\d+>    → matches /users/123, rejects /users/abc
```

### Query Parameters

```
/search?q&page     → { q: "term", page: "1" }
```

## Architecture

### Trie Structure

```typescript
interface SegmentNode {
  staticChildren: Record<string, SegmentNode>;  // exact segment match
  paramChild: SegmentNode | null;               // :param capture
  splatChild: SegmentNode | null;               // *splat capture
  route: CompiledRoute | null;                  // terminal route
  slashChildRoute: CompiledRoute | null;        // slash-child optimization
}
```

**Matching priority:** static children > param child > splat child.

### Compiled Routes

Routes are compiled at registration time into `CompiledRoute` objects with pre-built static parts and `BuildParamSlot` arrays for fast `buildPath()`.

### Static Cache

Parameterless routes are cached in a `Map<normalizedPath, CompiledRoute>` for O(1) lookup, bypassing trie traversal entirely.

## Performance

- **O(1) static route cache** — parameterless routes resolved without trie traversal
- **Pre-compiled build templates** — `buildPath` avoids regex at call time
- **`Object.create(null)` for trie nodes** — no prototype chain lookup
- **Fast encoding check** — regex test before encoding to skip no-op cases

## Type Exports

```typescript
import type {
  BuildParamSlot,
  BuildPathOptions,
  CompiledRoute,
  ConstraintPattern,
  MatcherInputNode,
  MatchResult,
  ParamMeta,
  ResolvedMatcherOptions,
  SegmentMatcherOptions,
  SegmentNode,
  URLParamsEncodingType,
} from "path-matcher";
```

## Related Packages

- [route-tree](../route-tree) — route tree building and matcher facade (uses path-matcher internally)
- [search-params](../search-params) — query string parsing/building (injected into SegmentMatcher)

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
