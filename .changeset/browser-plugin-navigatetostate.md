---
"@real-router/browser-plugin": minor
---

**Breaking:** Update `navigateToState()` signature

Remove `emitSuccess` parameter from the `navigateToState()` override to match the updated core API. Event emission is now driven by FSM transitions.
