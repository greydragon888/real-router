# @real-router/route-utils

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

Route tree queries and segment testing utilities for Real-Router. Pre-computed lookups for ancestor chains and siblings, plus regex-based segment matching with currying support.

## Installation

```bash
npm install @real-router/route-utils
# or
pnpm add @real-router/route-utils
```

## Quick Start

```typescript
import { createRouter, getPluginApi } from "@real-router/core";
import { getRouteUtils, startsWithSegment } from "@real-router/route-utils";

const router = createRouter([
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
      { name: "settings", path: "/settings" },
    ],
  },
  { name: "admin", path: "/admin" },
]);

const utils = getRouteUtils(getPluginApi(router).getTree());

utils.getChain("users.profile"); // → ["users", "users.profile"]
utils.getSiblings("users"); // → ["home", "admin"]
utils.isDescendantOf("users.profile", "users"); // → true

startsWithSegment("users.profile", "users"); // → true
```

---

## API

### `RouteUtils` Class

[Wiki](https://github.com/greydragon888/real-router/wiki/route-utils)

Pre-computes all route tree data eagerly in the constructor. Subsequent lookups are O(1) Map reads.

#### `new RouteUtils(root: RouteTreeNode)`

Creates a new instance. All ancestor chains and sibling lists are frozen during construction.

#### `utils.getChain(name): readonly string[] | undefined`

Returns the cumulative ancestor chain for a route. Root returns `[""]`; other routes exclude root.

```typescript
utils.getChain("users.profile.edit");
// → ["users", "users.profile", "users.profile.edit"]
```

#### `utils.getSiblings(name): readonly string[] | undefined`

Returns non-absolute siblings of a route (excluding itself). Root returns `undefined`.

#### `utils.isDescendantOf(child, parent): boolean`

O(k) string prefix check. Does not perform tree lookup.

#### Static Facade

`RouteUtils` exposes segment testers as `static readonly` properties — delegates to standalone functions:

```typescript
RouteUtils.startsWithSegment("users.list", "users"); // true
RouteUtils.endsWithSegment("users.profile.edit", "edit"); // true
RouteUtils.includesSegment("a.b.c.d", "b.c"); // true
RouteUtils.areRoutesRelated("users", "users.profile"); // true
```

---

### `getRouteUtils(root): RouteUtils`

WeakMap-cached factory. Same `RouteTreeNode` reference → same instance. [Wiki](https://github.com/greydragon888/real-router/wiki/route-utils)

```typescript
const utils1 = getRouteUtils(tree);
const utils2 = getRouteUtils(tree);
utils1 === utils2; // true
```

---

### Segment Testers

Standalone functions for testing dot-separated route name segments. Each supports direct, curried, and `State` object calling patterns. [Wiki](https://github.com/greydragon888/real-router/wiki/route-utils#startswithsegmentroute-segment)

#### `startsWithSegment(route, segment?)`

Tests if a route name starts with the given segment (respects dot boundaries).

```typescript
startsWithSegment("users.list", "users"); // true
startsWithSegment("users2.list", "users"); // false (dot boundary)

// Curried form
const tester = startsWithSegment("users.list");
tester("users"); // true
```

#### `endsWithSegment(route, segment?)`

Tests if a route name ends with the given segment. [Wiki](https://github.com/greydragon888/real-router/wiki/route-utils#endswithsegmentroute-segment)

#### `includesSegment(route, segment?)`

Tests if a route name includes the given segment anywhere (contiguous, dot-bounded). [Wiki](https://github.com/greydragon888/real-router/wiki/route-utils#includessegmentroute-segment)

#### `areRoutesRelated(route1, route2): boolean`

Checks if two routes are related in the hierarchy (same, parent-child, or child-parent). [Wiki](https://github.com/greydragon888/real-router/wiki/route-utils#areroutesrelatedroute1-route2)

---

### Types

```typescript
import type { SegmentTestFunction } from "@real-router/route-utils";
```

See [Wiki](https://github.com/greydragon888/real-router/wiki/route-utils#segmenttestfunction) for the full interface definition.

---

## Segment Validation

All segment testers validate input:

- **Max length**: 10,000 characters (`RangeError`)
- **Allowed characters**: `a-z`, `A-Z`, `0-9`, `.`, `-`, `_` (`TypeError`)
- **Empty / null segment**: returns `false` (no error)

---

## Performance

| Operation                   | Complexity | Notes                            |
| --------------------------- | ---------- | -------------------------------- |
| Construction                | O(n)       | Single DFS, n = number of routes |
| `getChain` / `getSiblings`  | O(1)       | Frozen cached arrays             |
| `isDescendantOf`            | O(k)       | String prefix check              |
| `getRouteUtils` (cache hit) | O(1)       | WeakMap lookup                   |
| Segment tester (cached)     | O(k)       | Regex test                       |

---

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — Core router
- [@real-router/react](https://www.npmjs.com/package/@real-router/react) — React integration (`useRouteUtils` hook)
- [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) — Browser history

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
