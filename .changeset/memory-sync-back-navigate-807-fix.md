---
"@real-router/memory-plugin": patch
---

Fix a synchronous `navigate()` fired in the same tick as `back()` / `forward()` / `go()` corrupting the in-memory history stack ([#807](https://github.com/greydragon888/real-router/issues/807))

`back()` / `forward()` / `go()` set an internal `navigatingFromHistory` flag and reset it only in a `.then` microtask, but core commits the history-restore navigation **synchronously**. A `navigate()` issued in the same tick therefore observed the stale flag and was swallowed as a phantom history-restore: the new route was never pushed, `state.context.memory` kept the back/forward `direction` and the old `historyIndex`, and a phantom forward leg survived (`canGoForward()` stayed `true`, `forward()` jumped to a route that no longer matched the router state).

The flag is now consumed when the restore commit is observed (`onTransitionSuccess`), not in the later microtask, so a same-tick `navigate()` is recorded as a normal push. The fire-and-forget contract and `back()`/`forward()`/`go()` semantics are unchanged; the generation guard still reverts the optimistic index on a guard-blocked or superseded history navigation.
