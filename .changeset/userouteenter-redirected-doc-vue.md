---
"@real-router/vue": patch
---

`useRouteEnter` docs: `transition.redirected` never fires (#1983)

The published JSDoc example branched on `route.transition.redirected` to show a
"redirected from …" toast. `@real-router/core` never sets that field — it only
ever carries what a caller passed as `{ redirected: true }` — so the branch is
silently dead for a `forwardTo` redirect and for a guard that navigates
elsewhere.

Rewritten on `transition.from`, with the trap named. No check is needed on it
inside this hook — the gate skips a mount that has no origin, so the handler
never runs without one. (`from` itself IS absent on the first commit from
`start()`; that is exactly the mount the gate skips.)
