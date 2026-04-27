---
"@real-router/vue": minor
---

Add `useRouteExit` and `useRouteEnter` composables (#547)

Vue parity with the React adapter (#544, #548). Identical API surface and types; idiomatic Vue implementation uses `onScopeDispose` and `watch` instead of `useEffect`.

- **`useRouteExit(handler, options?)`** — wraps `router.subscribeLeave` with reentrant abort pre-check and same-route skip (default `true`). Cleanup is bound to the component's effect scope via `onScopeDispose`.
- **`useRouteEnter(handler, options?)`** — fires `handler` once when the component mounts as a result of a navigation. Skip-initial via `watch(route)` (`immediate: false` by default), skip-same-route via `route.transition.from === route.name`. Reads from `useRoute()` (`{ route, previousRoute }: ShallowRefs`).

```ts
import { useRouteExit, useRouteEnter } from "@real-router/vue";

useRouteExit(async ({ signal }) => {
  await api.saveDraft(formState.value, { signal });
});

useRouteEnter(({ route, previousRoute }) => {
  analytics.track("page_enter", { route: route.name, from: previousRoute.name });
});
```

**Handler-reactivity caveat:** Vue composables run **once** in `setup()`; the handler is captured at hook-call time and is not swapped between renders. To vary behavior over time, read refs/computeds **inside** the handler body. See `packages/vue/CLAUDE.md` for details.

Types exported: `RouteExitContext`, `RouteExitHandler`, `UseRouteExitOptions`, `RouteEnterContext`, `RouteEnterHandler`, `UseRouteEnterOptions`.
