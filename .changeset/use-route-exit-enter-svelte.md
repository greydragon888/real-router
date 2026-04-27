---
"@real-router/svelte": minor
---

Add `useRouteExit` and `useRouteEnter` composables (#547)

Svelte 5 parity with the React adapter (#544, #548). Identical API surface and types; idiomatic Svelte 5 implementation uses `onDestroy` (for the leave subscription) and `$effect` (for the enter watcher), all in `.svelte.ts` files so they run inside the Svelte compiler.

- **`useRouteExit(handler, options?)`** — wraps `router.subscribeLeave` with reentrant abort pre-check and same-route skip (default `true`). Cleanup is bound to the component via `onDestroy`.
- **`useRouteEnter(handler, options?)`** — fires `handler` once when the component mounts as a result of a navigation. Skip-initial via `route.transition.from`, skip-same-route default. Reads from `useRoute()` (`{ route, previousRoute }: { current }`-getter pattern) inside `$effect`.

```svelte
<script lang="ts">
  import { useRouteExit, useRouteEnter } from "@real-router/svelte";

  useRouteExit(async ({ signal }) => {
    await api.saveDraft(formState, { signal });
  });

  useRouteEnter(({ route, previousRoute }) => {
    analytics.track("page_enter", { route: route.name, from: previousRoute.name });
  });
</script>
```

**Handler-reactivity caveat:** Svelte composables run **once** at component init; the handler is captured at hook-call time and is not swapped between renders. To vary behavior over time, read `$state` / `$derived` **inside** the handler body. See `packages/svelte/CLAUDE.md` for details.

Types exported: `RouteExitContext`, `RouteExitHandler`, `UseRouteExitOptions`, `RouteEnterContext`, `RouteEnterHandler`, `UseRouteEnterOptions`.
