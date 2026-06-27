---
"@real-router/core": patch
---

Suppress a reentrant `subscribe`-navigate's `RecursionDepthError` instead of leaking it (#945)

A `router.navigate()` called fire-and-forget from inside a `router.subscribe()` listener self-feeds nested `TRANSITION_SUCCESS` emits until the `EventEmitter`'s `maxEventDepth` ceiling throws `RecursionDepthError`. Left un-`.catch()`ed, that rejection leaked as a Node `unhandledRejection` — process-fatal under `--unhandled-rejections=strict` (the Node 22+ default) — for two reasons: the optimistic `lastSyncResolved` flag, set _before_ `completeTransition`, was left stale-`true` when the synchronous emit threw, so the facade skipped its safety-net `.catch`; and `RecursionDepthError` was not a suppressed rejection. Core now sets `lastSyncResolved` only _after_ `completeTransition` returns (a throw routes to the suppressing `.catch`) and suppresses the bounded `RecursionDepthError` in the fire-and-forget safety net — symmetric with `subscribeLeave`, whose reentrant navigate rejects with the already-suppressed `TRANSITION_CANCELLED`. The chain stays bounded and the router stays functional afterwards.
