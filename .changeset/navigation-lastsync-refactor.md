---
"@real-router/core": patch
---

Fire-and-forget suppression moves to the producer, and the `lastSync*` side channel is gone (#1588)

Internal refactor — no public behaviour changes. `navigate` / `navigateToDefault`
and the `navigateToState` plugin primitive still return `Promise<State>`, still
suppress the same expected rejections, and still hand back the same cached
rejection singletons by identity.

What changed underneath: `NavigationNamespace` exposed two mutable public fields,
`lastSyncResolved` / `lastSyncRejected`, that the facade read in three identical
blocks to decide whether to attach a suppressing `.catch()`. That is a side
channel for something a return type can say, and it had already produced two bugs
(#721) by going out of sync with reality.

Now the namespace answers with `State | Promise<State>` — a synchronously settled
navigation says so by returning a `State`, which is what `lastSyncResolved`
announced — and it suppresses its own rejections at one checkpoint per public
method, recognising its pre-suppressed singletons by identity instead of by flag.
The three facade blocks collapse to a single `Promise` wrap.

The two mechanisms cost the same (measured: ~5 ns either way), but they fail in
opposite directions: a missed identity costs one redundant `.catch()`, while a
flag left stale skips suppression on a *later* navigation and leaks the
rejection — #721 exactly. The suppression policy itself (`SUPPRESSED_ERROR_CODES`)
is now shared rather than duplicated: `start()` classifies its own failures by it
too.
