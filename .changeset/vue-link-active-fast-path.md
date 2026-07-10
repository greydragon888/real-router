---
"@real-router/vue": patch
---

fix(vue): wire `<Link>` to the shared active-name selector fast path (#1416)

`<Link>` built a per-link `createActiveRouteSource` for every link — the #1250
fast path landed only in the never-called `useIsActiveRoute` composable, so vue
was the one adapter where K default-options links held K `router.subscribe`
handles (a ~10k-link page hit the emitter's listener cap). The shared
`createActiveSource` fast/slow builder (promoted to `@real-router/sources`, where
it is now shared with the angular directives too) backs BOTH `<Link>`'s reactive
`watch` and `useIsActiveRoute`, so a default-options link resolves active state
through ONE per-router `createActiveNameSelector` subscription. Single source of truth for the fast/slow
decision, so the two callers can no longer drift (the drift that caused #1416).
Also adds the missing `routeName !== ""` guard the composable's copy lacked
(empty name stays on the slow path). A paramless `<Link>` to a param route is now
name-only active while a param instance is active — aligning vue with the react /
preact / solid / svelte / angular adapters.
