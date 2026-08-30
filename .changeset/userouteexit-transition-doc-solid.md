---
"@real-router/solid": patch
---

`useRouteExit` docs: `nextRoute.transition` is not a preview of the upcoming navigation (#1976)

The published JSDoc example read `transition.segments.deactivated` and `transition.redirected` off `nextRoute`. `nextRoute` is the PENDING
target, and transition metadata is written at the COMMIT — before
`@real-router/core` #1976 the field was absent there and the example THREW;
since #1976 it carries the neutral default, so the example silently never fires.

Replaced with a subtree test over `route.name` / `nextRoute.name`, plus a note
pointing at the surfaces where the metadata is real. Docs only.
