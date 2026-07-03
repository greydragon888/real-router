---
"@real-router/react": patch
---

Keep dead dom-utils code out of the `/ink` chunk (#800)

`InkRouterProvider` now composes a DOM-free `RouterProviderCore` (Router/Route/Navigator contexts + `useSyncExternalStore` wiring) instead of the full `RouterProvider`. The scroll-spy / view-transitions / route-announcer / scroll-restore factories are imported and called only by `RouterProvider`, so the chunk behind `dist/esm/ink.mjs` no longer carries their implementations — no `IntersectionObserver` wiring, `startViewTransition`, `aria-live` announcer, or scroll-capture code lands in the terminal bundle where none of it can run. Public API and runtime behavior are unchanged; the DOM `RouterProvider` keeps every feature prop (`announceNavigation` / `scrollRestoration` / `scrollSpy` / `viewTransitions`).
