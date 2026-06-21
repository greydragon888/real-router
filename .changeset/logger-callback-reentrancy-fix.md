---
"@real-router/logger": patch
---

Guard against re-entrant logger callbacks (#791)

A `callback` that itself calls `logger.*` on the happy path used to recurse through `#invokeCallback` until a swallowed `RangeError` (~5.9k self-calls and `console.error` per single log). A `#inCallback` re-entrancy guard now skips the nested callback invocation, turning the pattern into a safe no-op. Console output is unaffected: the nested message is still written once.
