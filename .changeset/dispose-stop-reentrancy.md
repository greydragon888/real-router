---
"@real-router/core": minor
---

Refuse a restart from a `$stop` listener that `dispose()` runs (#2786)

`dispose()` stops the router before it tears it down, and the `onStop` hooks and `$stop` listeners it runs now sit inside the reentrancy ban: a `start()` after `stop()`, or a navigation, called synchronously from one of them throws `RouterError(REENTRANT_NAVIGATION)`. Before, such a `start()` booted the router the teardown then disposed: a boot with nothing to wait for resolved on a router whose `isActive()` was already `false`, and one an async guard held never settled.

A `$stop` listener of a top-level `stop()` still restarts the router.

**Breaking Change:** `start()` called synchronously from an `onStop` hook or a `$stop` listener during `dispose()` throws.

**Migration:** a router being disposed is not restarted; create a new one instead.
