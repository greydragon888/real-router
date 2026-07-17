---
"@real-router/core": patch
---

Isolate an async (rejecting) plugin hook so it no longer leaks a Node `unhandledRejection` (#1412)

- The internal `EventEmitter` caught only **synchronous** listener throws; a plugin hook (`onStart`, `onTransitionSuccess`, …) is a raw listener, so an `async` hook that rejects escaped as an unhandled promise rejection — fatal under `--unhandled-rejections=strict` (the Node 22+ default).
- The emitter now inspects each listener's return value and routes a rejected thenable to the same `onListenerError` sink a sync throw flows through — centrally, so every listener kind is isolated symmetrically. The router still starts / completes the transition; the rejection surfaces via `logger.error` instead of crashing the process.
- Folds in `subscribe`'s per-site async isolation (#944): the `EventBusNamespace` wrapper now just returns the listener's value to the emitter's central isolation. Symmetric with `subscribeLeave`, which isolates via `Promise.allSettled`. No public API change.
