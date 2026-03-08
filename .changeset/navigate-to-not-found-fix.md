---
"@real-router/core": patch
---

Abort in-flight transition when `navigateToNotFound()` is called (#244)

Previously, calling `navigateToNotFound()` during an active async transition left two concurrent state mutations racing against each other. Now `navigateToNotFound()` aborts the in-flight transition via `AbortController` and sends FSM CANCEL event before setting state.
