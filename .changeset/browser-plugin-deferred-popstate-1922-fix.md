---
"@real-router/browser-plugin": patch
---

A popstate queued behind an in-flight transition is dropped on `stop()` / `teardown()` (#1922)

The `deferred` slot was filled when an event arrived mid-transition and emptied
only by `processDeferredEvent`, which the in-flight transition's `finally` calls
unconditionally. Neither lifecycle cleared it, so a queued event replayed after
the plugin was gone — navigating a router it no longer serves and, on the
strict-mode branch, writing history directly (`rollbackUrlToCurrentState` is
called by the handler, not by a lifecycle hook, so removing the hooks does not
stop it).

The listener contract itself was never broken: every `addEventListener` has its
`removeEventListener` on the same reference, which is why the listener-leak
suites were green on this. What leaked is a queued **event**.

`createPopstateHandler` now returns a `PopstateHandler` — the same callable with
a `discard()` — and both lifecycles call it from `onStop` and `teardown`,
unconditionally, since the queue belongs to that handler whoever currently owns
the shared listener slot (#758 / #1213).

The other half of #1922 — the rollback writing a whole `State` into
`history.state` — was already closed by #1837.
