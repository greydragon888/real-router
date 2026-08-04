---
"@real-router/core": minor
---

The start window is closed by the dispatch rule, not by a precondition of its own (#1647)

`emitRouterStart` was the one router emit that did not raise the dispatch depth.
That is the whole reason the boot window needed a hand-rolled predicate on the
facade: `completeStart()` reaches `READY` before the boot navigation commits, so
a plugin's `onStart` runs on a machine where `NAVIGATE` is declared, and a
navigation started there ran to completion, announced `TRANSITION_SUCCESS`, and
was then overwritten by the boot.

Counting the `$start` dispatch puts that window under the rule the other four
already use — `Router.#assertNotReentrant`, the same ban a transition listener
gets (#1610 / RFC navigation-cancellation-unification §4). Both facade
preconditions are gone with it: `Router.#refusesBeforeBootCommit` (#1661) and the
inline `navigateToNotFound` refusal (#1644). Nothing about WHICH calls are
refused changed — measured across all five windows, with the ledger of announced
states unchanged on every one.

**Migration.** From a plugin's `onStart` hook or a raw `ROUTER_START` listener,
`navigate` / `navigateToDefault` / `navigateToState` now **throw
`REENTRANT_NAVIGATION` synchronously** instead of returning a promise that
rejects `ROUTER_NOT_STARTED`. `navigateToNotFound` already threw there; only its
code changes, `ROUTER_NOT_STARTED` → `REENTRANT_NAVIGATION`. Inside a hook the
emitter's `onListenerError` isolation surfaces the throw (visible, non-fatal) and
the router still starts — which is strictly more than the previous refusal
offered a fire-and-forget caller, whose rejection was pre-suppressed and silent.

Defer instead (`queueMicrotask` / `await`), or navigate after `start()` resolves.
For an auth redirect out of the start route, use a `canActivate` guard on it: a
guard runs after the announce, outside the dispatch, and superseding the boot
from there is legal and unchanged.

Unaffected: a `navigate()` from a **guard** of the start navigation (the classic
redirect), a `navigateToNotFound` from such a guard (its 404 displaces the boot's
commit rather than being overwritten), `stop()` / `dispose()` / route CRUD from
`onStart`, and every arc after `start()` resolves.

The diagnostics the two preconditions carried did not go with them — they moved
to the sites that already knew the phase, so a caller inside a start
**interceptor** (where no emit is on the stack and the refusal is the FSM
table's) still gets a sentence naming the boot window instead of a bare
`ROUTER_NOT_STARTED`. An ordinary never-started router keeps the plain message.
