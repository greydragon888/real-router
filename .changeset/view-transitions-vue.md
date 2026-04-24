---
"@real-router/vue": minor
---

Add `viewTransitions` prop on `<RouterProvider>` for View Transitions API integration (#498)

Opt in with `<RouterProvider :router="router" :view-transitions="true">` to animate route transitions via the browser's View Transitions API. The prop is a boolean — utility is either enabled or no-op (SSR, Firefox without VT support). Reactive — toggling the prop at runtime creates/destroys the utility.

Customization is pure CSS via `::view-transition-*` pseudo-elements and `view-transition-name`. See the [View Transitions wiki page](https://github.com/greydragon888/real-router/wiki/View-Transitions) for patterns.

The utility lives in `shared/dom-utils/` as `createViewTransitions(router)` — same architectural pattern as `createScrollRestoration` (#497).
