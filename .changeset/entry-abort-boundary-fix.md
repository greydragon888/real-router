---
"@real-router/core": patch
---

An abort from an `opts` getter is announced and cancelled, not swallowed (#1704)

`navigate()` refuses an already-aborted caller signal without announcing —
nothing was announced, so nothing is owed a terminal event. An abort that lands
LATER is the opposite case: the navigation exists, so it is announced and then
cancelled.

Which of the two applied depended on WHICH `opts` field the getter aborted on.
`abortPreviousNavigation` re-read `opts.signal` after the prologue had already
read `reload`, `replace` and `redirected`, so an abort from any of those getters
took the silent path — `navigate()` rejected `TRANSITION_CANCELLED` while
plugins and `router.subscribe` consumers heard nothing at all, no
`TRANSITION_START` and no `TRANSITION_CANCEL`. `forceDeactivate` is read after
that re-read, and only it produced the pair. Measured on all five fields: four
silent, one announced.

`opts.signal` is now read once, at the entry, and the pre-check consults that
snapshot. The rule is one sentence: refuse silently only when the signal was
already dead when the router received it. Pinned by
`entry-abort-boundary.test.ts`, which asserts the events per field because the
outcome never discriminated — every cell rejects `TRANSITION_CANCELLED` either
way.

Behaviour change for `opts` implemented as a Proxy or with accessors: an abort
raised from a `reload` / `replace` / `redirected` getter now emits
`TRANSITION_START` followed by `TRANSITION_CANCEL`. A plain object cannot reach
this arc at all.
