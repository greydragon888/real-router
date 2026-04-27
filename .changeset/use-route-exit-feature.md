---
"@real-router/react": minor
---

Add `useRouteExit` hook (#544)

New React-side primitive for animation and side-effect coordination during the leave window.

**`useRouteExit(handler, options?)`** — wraps `router.subscribeLeave` with the universal guards: reentrant abort pre-check, same-route skip (`route.name === nextRoute.name`, opt-out via `skipSameRoute: false`), latest-handler ref so handler identity can change without resubscribing.

```tsx
import { useRouteExit } from "@real-router/react";

useRouteExit(async ({ signal }) => {
  await api.saveDraft(formState, { signal });
});
```

The hook is general-purpose — animation is one case. Other scenarios: auto-save form drafts, cancel inflight requests, capture scroll position, optimistic-UI rollback, library-coordinated exit (motion's `AnimatePresence onExitComplete`).

Companion utility shipped alongside in `shared/dom-utils`:

- **`createDirectionTracker(router)`** — popstate-driven `data-nav-direction` on `<html>` for direction-aware CSS / library state. Must be installed **before** `router.usePlugin(browserPluginFactory())` due to popstate listener ordering. Used in `examples/web/react/animation-examples/route-animations`.

**Breaking (pre-1.0):** `createRouteAnimator` and the internal `awaitElementAnimations` helper are removed from `shared/dom-utils`. The single consumer (`route-animations` example) was rewritten as a presence-only React component (`<PageAnimator />`) built on top of `useRouteExit`, symmetric with `<HeroMorph />` and `<ListFlip />` already in that example. The 4-line CSS-class exit recipe (style flush + `Element.getAnimations()` + `Promise.allSettled`) is inlined where it runs — pedagogically clearer than a separate utility, no abstraction tax.

Migration if you used `createRouteAnimator(router, { exitClass, selector })` directly: write a small React component that calls `useRouteExit` with the same recipe. See `examples/web/react/animation-examples/route-animations/src/animations/PageAnimator.tsx` for the canonical 30-line implementation.

Replication to Preact / Vue / Solid / Svelte / Angular tracked in #547.
