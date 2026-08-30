---
"@real-router/vue": patch
---

`useRouteExit` docs: `nextRoute.transition` is not a preview of the upcoming navigation (#1976)

The published JSDoc example read `nextRoute.transition.segments.deactivated` and
`nextRoute.transition.redirected` under the caption "preview of the upcoming
nav". `nextRoute` is the PENDING target, and neither field says anything there:
before `@real-router/core` #1976 the whole `transition` object was absent, so the
example threw; since #1976 the pending state carries the neutral default, so
`segments.deactivated` is `[]` and `redirected` is `undefined` whatever the
navigation is — the example silently never fires.

Replaced with the pattern that actually answers "am I leaving this subtree",
comparing `route.name` against `nextRoute.name`, plus a note that transition
metadata is meaningful only on a COMMITTED state (`router.subscribe`, a plugin's
`onTransitionSuccess`, or `getState()`).

Documentation only — no behaviour change.
