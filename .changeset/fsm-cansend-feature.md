---
"@real-router/fsm": minor
---

Add `canSend()` for O(1) event validity check (#123)

New `canSend(event): boolean` method checks if an event is valid in the current state. Uses cached `#currentTransitions` for O(1) lookup without triggering any transitions or side effects.
