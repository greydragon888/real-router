---
"@real-router/types": minor
---

Add `Navigator` interface for safe router subset (#37)

New `Navigator` interface providing minimal router API for UI components:

- `navigate()` — navigate to route
- `getState()` — get current state
- `isActiveRoute()` — check if route is active
- `subscribe()` — subscribe to route changes
