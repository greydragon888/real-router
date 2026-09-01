---
"@real-router/hash-plugin": patch
---

A popstate queued behind an in-flight transition is dropped on `stop()` / `teardown()` (#1922)

`createHashSyncLifecycle` removed both listeners on `stop()` / `teardown()` but
left the handler's deferred-event queue standing, and the in-flight
transition's `finally` drains that queue unconditionally — so a queued event
replayed after the plugin was gone. It now calls `PopstateHandler.discard()` on
both exits.

The handler and both lifecycles are shared with `@real-router/browser-plugin`
via `browser-env`; see that package's changeset for the measured behaviour.
