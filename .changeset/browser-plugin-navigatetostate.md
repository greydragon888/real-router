---
"@real-router/browser-plugin": minor
---

**Breaking:** Update `navigateToState()` signature (#123)

Remove `emitSuccess` parameter from the `navigateToState()` override to match the updated core API. Event emission is now driven by FSM transitions.
