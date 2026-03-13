---
"@real-router/react": minor
---

Remove raw Context exports from public API (#283)

**Breaking Change:** `RouterContext`, `RouteContext`, and `NavigatorContext` are no longer exported from `@real-router/react` or `@real-router/react/legacy`. Use the corresponding hooks instead.

**Migration:**

```diff
- import { RouterContext } from "@real-router/react";
- const router = useContext(RouterContext);
+ import { useRouter } from "@real-router/react";
+ const router = useRouter();
```

```diff
- import { RouteContext } from "@real-router/react";
- const routeState = useContext(RouteContext);
+ import { useRoute } from "@real-router/react";
+ const { route, previousRoute } = useRoute();
```

```diff
- import { NavigatorContext } from "@real-router/react";
- const navigator = useContext(NavigatorContext);
+ import { useNavigator } from "@real-router/react";
+ const navigator = useNavigator();
```
