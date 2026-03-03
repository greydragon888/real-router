---
"@real-router/core": minor
---

Remove `nameToIDs` from public API (#214)

**Breaking Change:** `nameToIDs` is no longer exported from `@real-router/core`.

**Migration:** Use `RouteUtils.getChain()` from `@real-router/route-utils` instead:

```diff
- import { nameToIDs } from "@real-router/core";
- const chain = nameToIDs("users.profile");
+ import { getPluginApi } from "@real-router/core";
+ import { getRouteUtils } from "@real-router/route-utils";
+ const utils = getRouteUtils(getPluginApi(router).getTree());
+ const chain = utils.getChain("users.profile");
```
