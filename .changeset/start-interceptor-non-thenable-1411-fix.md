---
"@real-router/core": patch
---

Reject cleanly when a `start` interceptor never calls next() (#1411)

A `start` interceptor that returned without calling `next()` (a non-thenable, typically `undefined`) made `Router.start()` throw a raw synchronous `TypeError: Cannot read properties of undefined (reading 'catch')` — the returned promise never settled and the FSM stuck in `STARTING` (`isActive()` stayed `true`), pointing the crash at internal code instead of the offending plugin. `Router.start()` now detects a non-thenable interceptor-chain result and rejects with an actionable `TypeError` (`a \`start\` interceptor returned without calling next()`), so the router unwinds through the existing failed-start recovery and `start()` honors its `Promise<State>` contract. Same deferred-crash class as the #939 start-path guard.
