---
"@real-router/browser-plugin": minor
---

Remove `StateMeta.redirected` and `StateMeta.source` writes (#121)

Internal state construction no longer sets the removed `redirected` and `source` fields on `state.meta`. No public API change — `NavigationOptions.source` and `NavigationOptions.redirected` are unaffected.
