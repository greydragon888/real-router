---
"@real-router/react": minor
---

Add `useRouteEnter` hook (#548)

Symmetric counterpart to `useRouteExit` (#544). Fires `handler` once when the component mounts as a result of a navigation, with the mount-time `{ route, previousRoute }` snapshot.

```tsx
import { useRouteEnter } from "@real-router/react";

useRouteEnter(({ route, previousRoute }) => {
  analytics.track("page_enter", {
    route: route.name,
    from: previousRoute.name,
  });
});
```

What the hook covers that ad-hoc `useEffect` + `useRoute()` doesn't:

- **Skip-initial** — handler is skipped when there is no `previousRoute` (i.e. first-load mount). Most consumers want to fire side effects only on real navigations, not on hydration.
- **StrictMode double-mount immunity** — in dev, React's StrictMode runs every effect twice to surface bugs. Without a guard, analytics fire twice, animations restart, focus jumps. The hook tracks the last-handled `route` reference and short-circuits the second pass.
- **Latest-handler ref** — handler can change identity on every render without re-running the effect.
- **Mount-time snapshot** — handler receives the values that were live at the moment of mount, not the latest ones.

Common scenarios covered: direction-aware entry animation (read `route.context.browser?.direction`), source-aware focus management (`route.context.browser?.source === "navigate"`), analytics page-enter events, request cancellation tied to navigation.

Race-safety: `useRoute()` is wired through `useSyncExternalStore` from `@real-router/sources`, so by the time the new component's effect runs, the snapshot is the post-commit one. The hook does not need a separate centralised buffer or new context — it consumes `useRoute()` directly.

Replication to Preact / Vue / Solid / Svelte / Angular tracked in #547.
