---
"@real-router/angular": patch
---

perf(angular): commit the RouteView route swap synchronously to remove the ~0.85 ms felt-wall nav latency (#1466)

`RouteView` rendered the active route via a template `@if (activeTemplate())` binding driven by the route signal. Under zoneless change detection the signal is set synchronously from `router.navigate()`, but the outlet swap only materialised on Angular's **asynchronously scheduled** CD flush — leaving a ~0.85 ms idle gap between the click and the route-DOM commit (the felt latency `@angular/router` avoids by activating its `<router-outlet>` synchronously).

`RouteView`'s source callback now calls `detectChanges()` after setting the route signal (only on navigation emissions, not the initial snapshot), committing the swap in the click task — mirroring the existing `RealLink` direct-DOM-write pattern. Measured on the cross-router benchmark (Apple M3 Pro, n=20): nav-latency `navMsWall` **0.97 → 0.07 ms (~13×)**, nested-switch ~7×, nav-churn ~13×; real-router now leads `@angular/router` on felt nav latency (was ~4× behind). CPU (`navMsTask`) and per-nav allocation are unchanged-to-lower. Behaviour is otherwise identical.
