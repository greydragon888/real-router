---
"@real-router/preact": minor
---

Add `useRouteExit` and `useRouteEnter` hooks (#547)

Preact parity with the React adapter (#544, #548). Same API surface, same guards, same docstring examples.

- **`useRouteExit(handler, options?)`** — wraps `router.subscribeLeave` with reentrant abort pre-check, same-route skip (default `true`), and latest-handler ref so handler identity can change between renders without resubscribing.
- **`useRouteEnter(handler, options?)`** — fires `handler` once when a component mounts as a result of a navigation. Skip-initial via `route.transition.from`, skip-same-route default, latest-handler ref. Uses Preact's `useSyncExternalStore` polyfill, so the snapshot is post-commit (the same race-safety guarantee as React).

```tsx
import { useRouteExit, useRouteEnter } from "@real-router/preact";

useRouteExit(async ({ signal }) => {
  await api.saveDraft(formState, { signal });
});

useRouteEnter(({ route, previousRoute }) => {
  analytics.track("page_enter", { route: route.name, from: previousRoute.name });
});
```

Notes vs React:

- Preact has no `StrictMode` equivalent. The `lastHandledRouteRef` dedupe guard is preserved for defensive symmetry but is otherwise harmless.
- Handler identity remains reactive (functional components re-run hooks per render and `useLayoutEffect` keeps the registered wrapper pointing at the latest handler).

Types exported: `RouteExitContext`, `RouteExitHandler`, `UseRouteExitOptions`, `RouteEnterContext`, `RouteEnterHandler`, `UseRouteEnterOptions`.
