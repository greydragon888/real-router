---
"@real-router/solid": patch
---

Internalize the route-enter/exit window guards: `useRouteEnter`/`useRouteExit` (`injectRouteEnter`/`injectRouteExit`) now delegate to the shared `createRouteEnterGate` / `guardLeaveListener` primitives from `@real-router/sources` (#1435). Behavior-neutral — the public hook signatures are unchanged. It also closes the #1218-class test gap on the fused `!previousRoute` guard, which was reachable at runtime but hidden under a v8-ignore — the guard is now exercised at 100% in `@real-router/sources`. No runtime behavior change. Also corrects the exit-hook JSDoc: a rejected handler Promise surfaces the original error + `TRANSITION_ERROR`, not `TRANSITION_CANCELLED`.
