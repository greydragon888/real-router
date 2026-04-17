---
"@real-router/memory-plugin": minor
---

Harden input validation and teardown (#470)

**Input validation**

- `memoryPluginFactory({ maxHistoryLength: NaN })`, `Infinity`, or `0.5` now throw at factory time. Previously these slipped through the `typeof === "number"` check and caused subtle history corruption at runtime.
- `router.go(delta)` now silently returns when `delta` is `NaN`, `Infinity`, or a non-integer (in addition to the existing `delta === 0` short-circuit). Previously non-finite deltas propagated into the history index and produced stuck or out-of-range state.

**Teardown**

- `teardown()` is now idempotent via a `#disposed` flag. Double-dispose scenarios (e.g., `router.dispose()` after user-level `unsubscribe()`, or vice versa) no longer double-release the context namespace claim.

**Internal**

- Extracted `#writeMemoryContext(toState, direction)` helper — dedupes the two `claim.write(...)` sites in `onTransitionSuccess`.
- `this.#entries.splice(this.#index + 1)` replaced with `this.#entries.length = this.#index + 1` for cheaper truncation on every forward navigation that invalidates the future.
