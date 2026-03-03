# @real-router/route-utils

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

Route tree queries and segment testing utilities for Real-Router. Pre-computed lookups for ancestor chains and siblings, plus regex-based segment matching with currying support.

## Installation

```bash
npm install @real-router/route-utils
# or
pnpm add @real-router/route-utils
# or
yarn add @real-router/route-utils
# or
bun add @real-router/route-utils
```

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core";
import {
  RouteUtils,
  getRouteUtils,
  startsWithSegment,
} from "@real-router/route-utils";

const router = createRouter([
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [
      { name: "profile", path: "/:id" },
      { name: "settings", path: "/settings" },
    ],
  },
  {
    name: "admin",
    path: "/admin",
    children: [{ name: "dashboard", path: "/dashboard" }],
  },
]);

// Get route tree from the router
const api = getPluginApi(router);
const tree = api.getTree();

// Create RouteUtils — all data pre-computed in constructor
const utils = getRouteUtils(tree);

// Ancestor chain lookup — O(1)
utils.getChain("users.profile");
// → ["users", "users.profile"]

// Sibling lookup — O(1)
utils.getSiblings("users");
// → ["admin"]

// Descendant check — O(k) string comparison
utils.isDescendantOf("users.profile", "users");
// → true

// Segment testing — standalone or via static facade
startsWithSegment("users.profile", "users");
// → true
RouteUtils.startsWithSegment("users.profile", "users");
// → true
```

---

## API

### `RouteUtils` Class

#### `new RouteUtils(root: RouteTree)`

Creates a new instance. All ancestor chains and sibling lists are eagerly pre-computed and frozen during construction. Subsequent lookups are O(1) Map reads.

#### `utils.getChain(name): readonly string[] | undefined`

Returns the cumulative ancestor chain for a route (excluding root).

```typescript
utils.getChain("users.profile.edit");
// → ["users", "users.profile", "users.profile.edit"]

utils.getChain("");
// → [""]  (root)

utils.getChain("nonexistent");
// → undefined
```

#### `utils.getSiblings(name): readonly string[] | undefined`

Returns non-absolute siblings of a route (excluding itself).

```typescript
utils.getSiblings("users");
// → ["admin"]  (other root-level non-absolute routes)

utils.getSiblings("users.profile");
// → ["users.settings"]  (other children of "users")

utils.getSiblings("");
// → undefined  (root has no parent)
```

#### `utils.isDescendantOf(child, parent): boolean`

Checks if `child` is a descendant of `parent` via dot-separated prefix comparison. Does not perform tree lookup — O(k) where k is name length.

```typescript
utils.isDescendantOf("users.profile", "users"); // true
utils.isDescendantOf("users.profile.edit", "users"); // true
utils.isDescendantOf("users", "users"); // false (same route)
utils.isDescendantOf("users2", "users"); // false (respects dot boundary)
```

#### Static Facade: Segment Testing

`RouteUtils` exposes segment testers as static readonly properties, delegating to standalone functions:

```typescript
RouteUtils.startsWithSegment("users.list", "users"); // true
RouteUtils.endsWithSegment("users.profile.edit", "edit"); // true
RouteUtils.includesSegment("a.b.c.d", "b.c"); // true
RouteUtils.areRoutesRelated("users", "users.profile"); // true
```

---

### `getRouteUtils(root): RouteUtils`

Factory with WeakMap caching. Returns the same `RouteUtils` instance for the same `RouteTree` reference.

```typescript
const utils1 = getRouteUtils(tree);
const utils2 = getRouteUtils(tree);
utils1 === utils2; // true — same reference
```

---

### Segment Testers

Standalone functions for testing route name segments. Each supports three calling patterns: direct, curried, and with `State` objects.

#### `startsWithSegment(route, segment?)`

Tests if a route name starts with the given segment (respects dot boundaries).

```typescript
// Direct call
startsWithSegment("users.list", "users"); // true
startsWithSegment("users2.list", "users"); // false (dot boundary)

// Curried form
const tester = startsWithSegment("users.list");
tester("users"); // true
tester("admin"); // false

// With State object
startsWithSegment(
  { name: "users.list", params: {}, path: "/users/list" },
  "users",
); // true
```

#### `endsWithSegment(route, segment?)`

Tests if a route name ends with the given segment.

```typescript
endsWithSegment("users.profile.edit", "edit"); // true
endsWithSegment("users.profile.edit", "profile"); // false
```

#### `includesSegment(route, segment?)`

Tests if a route name includes the given segment anywhere (contiguous, dot-bounded).

```typescript
includesSegment("a.b.c.d", "b.c"); // true (contiguous match)
includesSegment("a.b.c.d", "a.c"); // false (not contiguous)
```

#### `areRoutesRelated(route1, route2): boolean`

Checks if two routes are related in the hierarchy (same, parent-child, or child-parent).

```typescript
areRoutesRelated("users", "users.list"); // true (parent-child)
areRoutesRelated("users.list", "users"); // true (child-parent)
areRoutesRelated("users", "users"); // true (same)
areRoutesRelated("users", "admin"); // false (different branches)
areRoutesRelated("users.list", "users.view"); // false (siblings)
```

---

### Types

```typescript
import type { SegmentTestFunction } from "@real-router/route-utils";

interface SegmentTestFunction {
  (route: State | string): (segment: string) => boolean; // curried
  (route: State | string, segment: string): boolean; // direct
  (route: State | string, segment: null): false; // null guard
}
```

---

## Segment Validation

All segment testers validate input:

- **Max length**: 10,000 characters (`RangeError`)
- **Allowed characters**: `a-z`, `A-Z`, `0-9`, `.`, `-`, `_` (`TypeError`)
- **Empty segment**: returns `false` (no error)
- **Null segment**: returns `false` (no error)

---

## Performance

- **Construction**: Eagerly pre-computes all chains and siblings during `new RouteUtils(root)`. One-time O(n) cost.
- **Lookups**: `getChain` and `getSiblings` are O(1) — frozen cached arrays from `Map.get()`.
- **`isDescendantOf`**: Pure string comparison — O(k) where k = name length. No tree traversal.
- **`getRouteUtils`**: WeakMap cache — avoids redundant construction for the same tree.
- **Segment testers**: Compiled regex cached per segment string.

---

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — Core router
- [@real-router/react](https://www.npmjs.com/package/@real-router/react) — React integration
- [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) — Browser history

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
