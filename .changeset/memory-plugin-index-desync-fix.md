---
"@real-router/memory-plugin": minor
---

Fix index desync when guard blocks back/forward navigation (#294)

`#go(delta)` now updates `#index` in `.then()` instead of synchronously before `navigate()`. If a guard blocks the navigation, the index stays unchanged — `canGoBack()`/`canGoForward()` always reflect the actual router state. Also adds early return for `go(0)`.
