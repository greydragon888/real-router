---
"@real-router/react": patch
---

Fix: duplicate `<RouteView.NotFound>` is now first-wins, symmetric with `<Self>` (#1220)

`recordFallback` assigned `slots.notFoundChildren` unconditionally, so multiple `<RouteView.NotFound>` under one `<RouteView>` were **last-wins** — a later duplicate silently overwrote the earlier one. This contradicted the documented Self-symmetric first-wins contract (the `<Self>` slot has always been guarded by `selfFound`). Added a matching `notFoundFound` first-wins guard, so the **first** `<RouteView.NotFound>` now contributes and subsequent duplicates are ignored. Locked by a converted functional regression and a new duplicate-NotFound property invariant (both mutation-validated).
