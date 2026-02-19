---
"@real-router/fsm": minor
---

Add typed `on(from, event, action)` for transition actions

New `on(from, event, action)` method registers a type-safe action for a specific `(from, event)` pair. Actions fire before `onTransition` listeners. Lazy `#actions` Map — zero-cost when not used. Returns an unsubscribe function.
