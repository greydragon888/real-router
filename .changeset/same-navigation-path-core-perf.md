---
"@real-router/core": patch
---

Replace `areStatesEqual` with path comparison in `isSameNavigation` (#364)

Use `fromState.path === toState.path` instead of O(n) param iteration to detect duplicate navigations. Path is the canonical representation of (name, params) — single string comparison on every `navigate()` call.
