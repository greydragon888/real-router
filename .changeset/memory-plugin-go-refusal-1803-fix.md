---
"@real-router/memory-plugin": patch
---

`back()` / `forward()` / `go(n)` no longer erase a page when the restore is refused synchronously (#1803)

`#go` writes `#index` optimistically and unwound it only from a rejection
handler. The facade refuses a nested navigation **synchronously** (#1610) —
which is what `back()` called from a `router.subscribe` listener meets — and a
synchronous throw never reaches `.catch`, so the index stayed one slot behind.
`#index` is the truncation point for the next push, so the next ordinary
`navigate()` cut history there and deleted the entry the user was standing on:
`canGoForward()` reported a forward entry on the newest one, and `back()` could
never reach the deleted page again. With `go(-2)` two entries went and the
back-walk stalled.

Both doors now unwind through one helper, keeping the `#goGeneration` and
"revert only if the index is still ours" identity checks (#505, #1234).
