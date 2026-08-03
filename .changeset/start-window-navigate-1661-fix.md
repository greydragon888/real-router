---
"@real-router/core": patch
---

Nothing commits before the start navigation does — on the navigate family too (#1661)

`completeStart()` sends `STARTED`, leaving `STARTING` for `READY`, **before** the
boot navigation commits. Every plugin `onStart` hook therefore runs on a `READY`
machine with `getState() === undefined` and a commit still owed — and `NAVIGATE`
is declared on `READY`, so a navigation started from there was accepted, ran to
completion synchronously, announced `TRANSITION_SUCCESS`, and was then overwritten
by the boot. Subscribers (i.e. every framework adapter) were handed a committed
state that stopped being true one tick later.

`navigate()`, `navigateToDefault()` and `getPluginApi(router).navigateToState()`
now reject with `ROUTER_NOT_STARTED` in that window, with a message naming it.
This is the same rule `navigateToNotFound` already enforced (#1644) on the
channels that fix did not sweep; the refusal is a rejection rather than a throw
because that is how these three already report failure.

Unchanged on purpose: a `navigate()` from a **guard of the start navigation** —
the classic redirect — still works. From `onStart` the router has no navigation in
flight; from a boot guard it does, and that is the only thing separating the two
(both run on a `READY` machine with nothing committed). An ordinary not-started
router also keeps its plain `ROUTER_NOT_STARTED` message.

Also fixes #1662 — with the nested navigation refused, a `start()` whose boot route
the hook targeted no longer rejects `SAME_STATES`.
