---
"@real-router/core": patch
---

Recover FSM from STARTING when start pipeline throws (#668)

`Router.start()` advanced the FSM `IDLE → STARTING` before running the
start-interceptor pipeline, but the `.catch` block only recovered from
`READY`. A sync-throwing or async-rejecting start interceptor left the FSM
stuck in `STARTING` with no FAIL emitted: subsequent `start()` calls rejected
with `ROUTER_ALREADY_STARTED` forever, `stop()` was a no-op, and the only
escape was `dispose()`.

`start()` now wraps the interceptor pipeline so sync throws become
rejections, and the `.catch` block also recovers from `STARTING` by emitting
`sendFail()` to return the FSM to `IDLE`. A misbehaving start interceptor
no longer bricks the router — the caller can drop the bad plugin and retry.
