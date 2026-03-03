---
"@real-router/react": minor
---

Add `useRouteUtils()` hook (#214)

New hook providing direct access to `RouteUtils` instance without manual initialization:

```typescript
import { useRouteUtils } from "@real-router/react";

function Breadcrumbs() {
  const utils = useRouteUtils();
  const chain = utils.getChain(route.name);
  // ...
}
```

Internally calls `getRouteUtils(getPluginApi(router).getTree())` — returns a cached, pre-computed instance.
