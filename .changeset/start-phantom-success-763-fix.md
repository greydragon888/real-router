---
"@real-router/core": minor
---

Keep the committed state when a `start` interceptor rejects after commit ([#763](https://github.com/greydragon888/real-router/issues/763))

A `start` interceptor that throws *after* `next(path)` already committed the state and emitted `TRANSITION_SUCCESS` — the window where the SSR/RSC loader plugins run their loader — no longer rolls the router back to IDLE. Subscribers had already observed the success, so retracting it left a "phantom success": the event fired, then `getState()` went back to `undefined`.

- Post-commit interceptor rejection: the committed state stands, `isActive()` stays `true`, and the loader error surfaces only through the rejected `start()` promise (the "Loader errors propagate" contract is preserved).
- Pre-commit failures (route not found, a blocked activation guard, a sync interceptor throw before `next()`) are unchanged — the half-started FSM still unwinds to IDLE (two-phase start).

Breaking for code that relied on a rejected `start()` always leaving the router un-started: after a post-commit interceptor failure the router is now started, so a retry must `stop()` first (a second `start()` rejects with `ROUTER_ALREADY_STARTED`).
