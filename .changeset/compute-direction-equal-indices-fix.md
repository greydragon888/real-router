---
"@real-router/navigation-plugin": patch
---

Fix `computeDirection` returning "back" for traverse with equal indices (#448)

`computeDirection("traverse", i, i)` now correctly returns `"unknown"` instead of `"back"` when destination and current indices are equal.
