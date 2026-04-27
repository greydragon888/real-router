---
"@real-router/solid": minor
---

Add `useRouteExit` and `useRouteEnter` hooks (#547)

Solid parity with the React adapter (#544, #548). API surface and types are identical; idiomatic Solid implementation uses `createEffect` + `onCleanup` instead of `useEffect`.

- **`useRouteExit(handler, options?)`** — wraps `router.subscribeLeave` with reentrant abort pre-check and same-route skip (default `true`). Cleanup is bound to the component via `onCleanup`.
- **`useRouteEnter(handler, options?)`** — fires `handler` once when the component mounts as a result of a navigation. Skip-initial via `route.transition.from`, skip-same-route default. Reads from `useRoute()` (`Accessor<RouteState>`) inside `createEffect`.

```tsx
import { useRouteExit, useRouteEnter } from "@real-router/solid";

useRouteExit(async ({ signal }) => {
  await api.saveDraft(formState, { signal });
});

useRouteEnter(({ route, previousRoute }) => {
  analytics.track("page_enter", { route: route.name, from: previousRoute.name });
});
```

**Handler-reactivity caveat:** Solid components run **once**; the handler is captured at hook-call time and is not swapped between renders. To vary behavior over time, read signals **inside** the handler body. See `packages/solid/CLAUDE.md` for details.

Types exported: `RouteExitContext`, `RouteExitHandler`, `UseRouteExitOptions`, `RouteEnterContext`, `RouteEnterHandler`, `UseRouteEnterOptions`.
