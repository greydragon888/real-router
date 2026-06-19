---
"@real-router/rx": patch
---

Fix `state$` out-of-order stale replay after a synchronous navigation (#771)

The deferred `queueMicrotask` replay no longer overrides a fresher `TRANSITION_SUCCESS` emission. When a synchronous navigation commits between `subscribe` and the replay microtask (core's optimistic-sync path), the replay now yields to the live event instead of delivering the stale subscribe-time snapshot after it — which previously rolled "latest emission" consumers back to the previous route.
