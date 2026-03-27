---
"@real-router/hash-plugin": patch
---

Replace `areStatesEqual` with path comparison in `shouldReplaceHistory` (#364)

Use `toState.path === fromState?.path` instead of `router.areStatesEqual()` to detect same-state reload. Removes `router` parameter dependency from `shouldReplaceHistory`.
