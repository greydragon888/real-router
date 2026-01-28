---
"@real-router/types": minor
"@real-router/core": minor
---

**BREAKING:** Move Router-dependent types from `@real-router/types` to `@real-router/core` (#31)

Types moved to `@real-router/core`:
- `Router` (class replaces interface)
- `Route`
- `RouteConfigUpdate`
- `ActivationFnFactory`
- `MiddlewareFactory`
- `PluginFactory`
- `BuildStateResultWithSegments`

**Migration:** If you import these types from `@real-router/types`, change your imports to `@real-router/core`:

```diff
- import type { Router, Route, PluginFactory } from "@real-router/types";
+ import type { Router, Route, PluginFactory } from "@real-router/core";
```

This change eliminates circular type dependencies between packages.
