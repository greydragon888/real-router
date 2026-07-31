---
"@real-router/core": patch
---

fix(core): a superseded navigation no longer reports its failure into the live FSM (#1609)

A navigation that had already been cancelled could still send `FAIL` into the router's state machine, because the failure paths reported by error CODE alone and `CANNOT_ACTIVATE` is not `TRANSITION_CANCELLED`. Reached two ways:

- **A rejecting async guard.** `finishAsyncNavigation` consulted liveness only where its guard/abort race RESOLVES; a rejection threw straight past that check into the `catch`. When the guard's rejection won a 1–2 microtask race against the abort that was meant to silence it, the dead navigation reported anyway.
- **The classic synchronous guard-redirect** — a guard that calls `navigate(...)` elsewhere and returns `false` — hit it on **every** invocation, not as a race: the guard's `CANNOT_ACTIVATE` was reported after the redirect target had already committed.

Two outcomes, depending on where the FSM was when the stale `FAIL` landed. With the FSM in `READY` it was observability noise — `[START, CANCEL, START, SUCCESS, ERROR]`, i.e. two mutually exclusive terminal outcomes for one navigation (the shape #1197 fixed on the no-guards path). With a navigation still in flight it was **silent state corruption**: `TRANSITION_STARTED --FAIL--> READY` moved the machine out from under the live navigation, so its later `COMPLETE` became a table no-op — the state committed and `navigate()` resolved, while `TRANSITION_SUCCESS` never fired and no `router.subscribe` consumer (`@real-router/sources` and every framework adapter) was notified.

Both failure arcs now report only while the navigation is still the one in flight, and restate a lost-liveness failure as the cancellation it actually was — so the caller's promise agrees with the `TRANSITION_CANCEL` the navigation already emitted instead of carrying a guard verdict nobody is waiting for. A value that already carries `TRANSITION_CANCELLED` is threaded through untouched, so #1197's canonicalized leave rejection keeps its `reason` (#943). Genuine failures of a live navigation are unchanged.

Behaviour change worth noting: `navigate()` for a superseded navigation now rejects with `RouterError(TRANSITION_CANCELLED)` (carrying the original error as `reason`) instead of the stale guard verdict, and emits no `TRANSITION_ERROR`. Both codes are in `SUPPRESSED_ERROR_CODES`, so fire-and-forget calls stay silent either way.
