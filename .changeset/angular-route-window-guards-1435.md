---
"@real-router/angular": minor
---

Internalize the route-enter/exit window guards: `injectRouteEnter` / `injectRouteExit` now delegate to the shared `createRouteEnterGate` / `guardLeaveListener` primitives from `@real-router/sources` (#1435). The public function signatures are unchanged.

This also **fixes a spurious `injectRouteEnter` re-fire** unique to Angular: because Angular's `effect()` tracks signals read inside the handler, a handler-read signal changing *without* a navigation previously re-ran the effect and re-invoked the enter handler for the same route — contrary to the documented "fire once per nav-driven mount" contract. The gate's dedupe now suppresses that re-fire, bringing Angular to once-per-mount parity with the other five adapters (minor bump: an observable runtime behavior change, though it only affects handlers that both read a signal and relied on the out-of-contract re-fire).

Also corrects the exit-hook JSDoc: a rejected handler Promise surfaces the original error + `TRANSITION_ERROR`, not `TRANSITION_CANCELLED`.
