---
"@real-router/react": minor
---

Remove `useIsActiveRoute` from public API (#280)

**Breaking Change:** `useIsActiveRoute` is no longer exported from `@real-router/react` or `@real-router/react/legacy`. The hook remains as an internal utility used by `<Link>`.

**Migration:**

```diff
- import { useIsActiveRoute } from "@real-router/react";
- const isActive = useIsActiveRoute("users.profile", { id });

+ import { useRouteNode } from "@real-router/react";
+ const { route } = useRouteNode("users");
+ const isActive = route?.name === "users.profile";
```

Or use `<Link>` which handles active state automatically via render props.
