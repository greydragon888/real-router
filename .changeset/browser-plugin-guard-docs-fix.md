---
"@real-router/browser-plugin": patch
---

Fix `GuardFnFactory` signature in README example (#298)

Guard factory receives `(router, getDep)`, not `()`. Updated deactivate guard example to show correct signature.
