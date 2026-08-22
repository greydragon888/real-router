---
"@real-router/core": patch
---

fix(core): a teardown triggered from inside a dependency write landed in the disposed store (#1859)

`setDependency` and `setMultipleDependencies` re-read `store.dependencies` on
every access, and both `dispose()` and `reset()` clear this channel by REPLACING
that property. A teardown triggered from inside the call therefore did not stop
it: the remaining writes found the fresh object and landed there. Every clear
path is a write path and refuses on a disposed router, so the caller's value was
pinned with nothing able to release it, while `getAll()` kept answering with it.

Both functions now capture the write target once, so an interrupted call writes
into the object the teardown discarded — garbage by construction rather than
guarded. The facades re-check disposal after the write, which is what tells the
caller their write landed nowhere instead of reporting success.

⚠ **There are TWO user-code windows per key, and the obvious fix only closes
one.** Reading `deps[key]` runs a caller's accessor; `validateDependencyCount`
and `warnOverwrite` reach `logger.warn` → the application's own
`LoggerConfig.callback`, which is public `RouterOptions` API and runs between
that read and the write. A disposal probe placed between them leaves the second
window wide open — measured, the callback route reproduced the leak in full on a
bag with **no accessors at all**. Capturing the target closes both, and closes
`reset()` with them.

⚠ `set()` was affected too and was never guarded: it wrote into the disposed
store and returned success.

The capture is also cheaper than the re-read it replaces — one property load
leaves the loop.
