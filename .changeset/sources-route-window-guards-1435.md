---
"@real-router/sources": minor
---

Add `createRouteEnterGate()` and `guardLeaveListener()` — the framework-agnostic route-enter/exit window-guard primitives shared by every adapter (#1435).

- `createRouteEnterGate()` returns a stateful decision closure owning the canonical enter-guard set (skip-initial, same-route, StrictMode dedupe, and the `!previousRoute` non-nullable-contract guard). `skipSameRoute` is a per-call argument so a React ref-held gate survives StrictMode effect re-runs without resetting its dedupe state.
- `guardLeaveListener(handler, { skipSameRoute? })` returns a core `subscribeLeave` listener owning the same-route + reentrant-abort guards and passing the handler's Promise through (so it blocks the transition).

Both consume only `State` / `AbortSignal` — zero framework types.
