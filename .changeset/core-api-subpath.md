---
"@real-router/core": minor
---

Move standalone API getters to `@real-router/core/api` subpath export (#297)

**Breaking Change:** `getPluginApi`, `getRoutesApi`, `getDependenciesApi`, `getLifecycleApi`, `cloneRouter` and types `PluginApi`, `RoutesApi`, `DependenciesApi`, `LifecycleApi` are no longer exported from `@real-router/core`.

**Migration:**

```diff
- import { createRouter, getPluginApi } from "@real-router/core";
- import type { Router, PluginApi } from "@real-router/core";
+ import { createRouter } from "@real-router/core";
+ import { getPluginApi } from "@real-router/core/api";
+ import type { Router } from "@real-router/core";
+ import type { PluginApi } from "@real-router/core/api";
```
