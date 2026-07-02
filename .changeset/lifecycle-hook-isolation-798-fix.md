---
"@real-router/lifecycle-plugin": patch
---

Isolate lifecycle hook exceptions so a throwing `onEnter`/`onStay` no longer swallows `onNavigate` of the same transition (#798)

Each lifecycle hook is now invoked with per-hook exception isolation. Previously a throwing `onEnter`/`onStay` aborted the plugin's `onTransitionSuccess` handler before `onNavigate` ran, silently breaking the documented `onNavigate` orthogonality invariant ("if both are defined, both fire"). The navigation itself always survived (core isolates the plugin handler), but `onNavigate` of that transition was swallowed.

Hook errors are now re-thrown asynchronously via `queueMicrotask` — mirroring `BaseSource`/`createActiveNameSelector` in `@real-router/sources` — so the developer signal still surfaces to global error handlers while every other hook of the transition still runs. Note the observable change: a throwing hook now surfaces as an asynchronous uncaught error rather than synchronously through the router's event-emitter "Error in listener" sink.
