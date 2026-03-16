---
"@real-router/fsm": patch
---

Optimize FSM for navigate hot path (#307)

Replace `...args` rest parameter with optional `payload?` in `send()` to eliminate V8 array allocation.
Add `forceState()` method for direct state transitions bypassing dispatch overhead.
Use nested Map for transition lookups instead of template literal key concatenation.
