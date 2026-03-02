---
"@real-router/route-utils": minor
---

Add `@real-router/route-utils` — cached read-only query API for route tree (#214)

New optional package providing `RouteUtils` class and `getRouteUtils()` factory with six query methods:

- `getRoute(name)` — O(1) node lookup by full name
- `getChain(name)` — ancestor chain from root to node (cached, for breadcrumbs)
- `getParent(name)` — parent node (`null` for root, `undefined` if not found)
- `getSiblings(name)` — non-absolute siblings excluding self (cached)
- `getNameSegments(name)` — cumulative name segments array (cached)
- `isDescendantOf(child, parent)` — O(k) string prefix check

`getRouteUtils(root)` caches instances via `WeakMap` — same root always returns same instance. Cache invalidates automatically when the immutable tree is replaced (new root on mutation).

```typescript
import { getPluginApi } from "@real-router/core";
import { getRouteUtils } from "@real-router/route-utils";

const plugin: PluginFactory = (router) => {
  const tree = getPluginApi(router).getTree();
  const utils = getRouteUtils(tree);

  return {
    onTransitionSuccess(toState) {
      const chain = utils.getChain(toState.name); // cached, no re-allocation
    },
  };
};
```
