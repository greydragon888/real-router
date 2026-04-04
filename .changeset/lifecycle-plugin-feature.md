---
"@real-router/lifecycle-plugin": minor
---

Add lifecycle-plugin: route-level onEnter, onStay, onLeave hooks (#394)

New plugin that adds declarative lifecycle hooks to route definitions:

```typescript
import { lifecyclePluginFactory } from "@real-router/lifecycle-plugin";

const routes = [
  {
    name: "dashboard",
    path: "/dashboard",
    onEnter: (toState) => analytics.track("dashboard_viewed"),
    onLeave: () => cleanup(),
  },
  {
    name: "users.view",
    path: "/users/:id",
    onStay: (toState, fromState) => refreshUser(toState.params.id),
  },
];

router.usePlugin(lifecyclePluginFactory());
```

- `onLeave` fires at `TRANSITION_LEAVE_APPROVE` (early, before activation guards)
- `onEnter` / `onStay` fire at `TRANSITION_SUCCESS`
- Module augmentation extends `Route` interface with typed hook fields
- No configuration, stateless, ~0.5 kB
