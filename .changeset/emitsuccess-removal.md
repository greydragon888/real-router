---
"@real-router/core": minor
---

**Breaking:** Remove `emitSuccess` parameter from `navigateToState()`

The `emitSuccess` parameter has been removed from `navigateToState()`. Event emission is now driven by FSM transitions and is no longer optional.
