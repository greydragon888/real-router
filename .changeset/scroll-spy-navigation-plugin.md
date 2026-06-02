---
"@real-router/navigation-plugin": patch
---

Suppress `scroll: "after-transition"` in `event.intercept()` to avoid fighting user scroll on plugin-originated re-emits (#575)

`NOOP_INTERCEPT` now passes `scroll: "manual"` alongside the no-op handler. The Navigation API spec defaults `event.intercept({ handler })` to `scroll: "after-transition"`, which auto-scrolls the new URL fragment into view after every navigation. For router-driven re-emits (scroll-spy hash-only nav, scroll-restoration URL sync) the router has already committed the transition and the app owns scroll position — auto-scroll fights against the user's own scroll motion.

Concrete bug closed: scroll-spy emit during a slow user scroll → viewport jump on every emit. Aligns with `browser-plugin` (History API has no auto-scroll on programmatic URL changes). Apps that want hash-anchor auto-scroll opt in via `createScrollRestoration({ anchorScrolling: true })` — the only `scroll` option of `event.intercept()` is `"manual"` vs `"after-transition"`; richer behaviour belongs in the scroll-restoration utility, not the navigate handler.

No public API change. Both router-driven and user-driven navigations under `navigation-plugin` now skip the Navigation API's built-in scroll-to-fragment.
