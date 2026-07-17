---
"@real-router/angular": patch
---

Internalize the route-enter/exit window guards: `useRouteEnter`/`useRouteExit` (`injectRouteEnter`/`injectRouteExit`) now delegate to the shared `createRouteEnterGate` / `guardLeaveListener` primitives from `@real-router/sources` (#1435). Behavior-neutral — the public hook signatures are unchanged. Also corrects the exit-hook JSDoc: a rejected handler Promise surfaces the original error + `TRANSITION_ERROR`, not `TRANSITION_CANCELLED`.
