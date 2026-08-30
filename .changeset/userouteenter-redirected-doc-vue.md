---
"@real-router/vue": patch
---

`useRouteEnter` docs: `transition.redirected` never fires (#1983)

The published JSDoc example branched on `route.transition.redirected` to show a
"redirected from …" toast. `@real-router/core` never sets that field — it only
ever carries what a caller passed as `{ redirected: true }` — so the branch is
silently dead for a `forwardTo` redirect and for a guard that navigates
elsewhere.

Rewritten on `transition.from`, which is populated on every navigation, with the
trap named. Documentation only.
