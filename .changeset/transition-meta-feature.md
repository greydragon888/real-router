---
"@real-router/core": minor
---

Add `state.transition` (TransitionMeta) after every navigation (#123)

After every successful navigation, `router.getState()` includes a deeply frozen `transition` field with: `phase` (last pipeline phase reached), `from` (previous route name), `reason` (`"success"` for resolved navigations), and `segments` (`deactivated`, `activated`, `intersection`).
