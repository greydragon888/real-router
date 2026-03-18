# @real-router/route-utils

[![npm](https://img.shields.io/npm/v/@real-router/route-utils.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/route-utils)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/route-utils.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/route-utils)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/route-utils&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/route-utils&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Cached read-only query API for [Real-Router](https://github.com/greydragon888/real-router) route tree structure. Pre-computed ancestor chains, sibling lookups, and regex-based segment testers.

## Installation

```bash
npm install @real-router/route-utils
```

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getRouteUtils, startsWithSegment } from "@real-router/route-utils";

const router = createRouter([
  { name: "home", path: "/" },
  { name: "users", path: "/users", children: [
    { name: "profile", path: "/:id", children: [
      { name: "edit", path: "/edit" },
    ]},
    { name: "settings", path: "/settings" },
  ]},
  { name: "admin", path: "/admin" },
]);

const utils = getRouteUtils(getPluginApi(router).getTree());

utils.getChain("users.profile");                  // ["users", "users.profile"]
utils.getSiblings("users");                        // ["home", "admin"]
utils.isDescendantOf("users.profile", "users");    // true

startsWithSegment("users.profile", "users");       // true
```

## RouteUtils

Pre-computes all route tree data in the constructor. Subsequent lookups are O(1) Map reads.

| Method | Returns | Description |
|--------|---------|-------------|
| `getChain(name)` | `readonly string[] \| undefined` | Ancestor chain (e.g., `["users", "users.profile", "users.profile.edit"]`) |
| `getSiblings(name)` | `readonly string[] \| undefined` | Sibling routes (excluding itself) |
| `isDescendantOf(child, parent)` | `boolean` | O(k) string prefix check |

### `getRouteUtils(root): RouteUtils`

WeakMap-cached factory — same tree reference returns the same instance:

```typescript
const utils1 = getRouteUtils(tree);
const utils2 = getRouteUtils(tree);
utils1 === utils2; // true
```

## Segment Testers

Standalone functions for testing dot-separated route name segments. Each supports direct, curried, and `State` object calling patterns.

| Function | Description |
|----------|-------------|
| `startsWithSegment(route, segment?)` | Route starts with segment (dot-bounded) |
| `endsWithSegment(route, segment?)` | Route ends with segment |
| `includesSegment(route, segment?)` | Route includes segment anywhere (contiguous) |
| `areRoutesRelated(route1, route2)` | Routes are same, parent-child, or child-parent |

```typescript
startsWithSegment("users.list", "users");         // true
startsWithSegment("users2.list", "users");         // false (dot boundary)
endsWithSegment("users.profile.edit", "edit");     // true
includesSegment("a.b.c.d", "b.c");                // true
areRoutesRelated("users", "users.profile");        // true

// Curried form — first arg is route, returns tester for segments
const tester = startsWithSegment("users.list");
tester("users");                                   // true

// Static access via RouteUtils
RouteUtils.startsWithSegment("users.list", "users"); // true
```

### Input Validation

- **Max length**: 10,000 characters (`RangeError`)
- **Allowed characters**: `a-z`, `A-Z`, `0-9`, `.`, `-`, `_` (`TypeError`)
- **Empty / null segment**: returns `false` (no error)

## Performance

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Construction | O(n) | Single DFS, n = number of routes |
| `getChain` / `getSiblings` | O(1) | Frozen cached arrays |
| `isDescendantOf` | O(k) | String prefix check |
| `getRouteUtils` (cache hit) | O(1) | WeakMap lookup |
| Segment testers | O(k) | Regex test, cached |

## Documentation

Full documentation: [Wiki — route-utils](https://github.com/greydragon888/real-router/wiki/route-utils)

## Related Packages

| Package | Description |
|---------|-------------|
| [@real-router/core](https://www.npmjs.com/package/@real-router/core) | Core router |
| [@real-router/react](https://www.npmjs.com/package/@real-router/react) | React integration (`useRouteUtils` hook) |
| [@real-router/sources](https://www.npmjs.com/package/@real-router/sources) | Subscription layer (uses route-utils internally) |

## Contributing

See [contributing guidelines](../../CONTRIBUTING.md) for development setup and PR process.

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
