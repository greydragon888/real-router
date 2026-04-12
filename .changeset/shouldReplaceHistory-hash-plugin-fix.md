---
"@real-router/hash-plugin": patch
---

Fix TypeError in `shouldReplaceHistory` when `replace:false` + `fromState:undefined` (#447)

Added optional chaining (`fromState?.path`) to prevent crash when the `??` operator preserves an explicit `false` for `replace`, bypassing the `!fromState` null guard and reaching `fromState.path` with `undefined`.
