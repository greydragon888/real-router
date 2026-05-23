---
"@real-router/core": patch
---

Unblock navigation pipeline when a `subscribeLeave` listener ignores its abort signal (#663)

`EventBusNamespace.awaitLeaveListeners` awaited leave-listener promises via
`Promise.allSettled` without observing the abort signal. A
`subscribeLeave(() => new Promise(() => {}))` (or any listener that ignores
`payload.signal`) hung the pipeline forever — concurrent `router.navigate`
calls aborted the controller but `allSettled` kept waiting, so no
navigation could complete.

`settleLeavePromises` now races `Promise.allSettled` against the abort
signal: when the signal aborts, the returned Promise rejects with
`signal.reason` and the navigation pipeline unwinds via the normal
`TRANSITION_CANCELLED` path. The abort event listener is cleaned up on
natural completion to avoid leaking handlers.

**Semantic note for plugin authors:** listeners that have not settled by
abort time are **abandoned** — their Promises may still resolve in the
background and hold references via closure until they do. Long-running
leave listeners must respect `payload.signal` for cooperative cleanup. The
router cannot synchronously force a hung Promise to resolve.
