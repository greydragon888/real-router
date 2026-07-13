---
"@real-router/angular": patch
---

perf(angular): commit route-reactive UI synchronously to remove the ~0.6-0.9 ms felt-wall nav latency (#1466)

Under zoneless change detection the router notifies synchronously from `router.navigate()`, but any route state read in a template only re-renders on Angular's **asynchronously scheduled** CD flush — a ~0.6-0.9 ms idle gap between the click and the DOM commit (`navMsWall ≫ navMsTask`). `@angular/router` avoids it by activating its `<router-outlet>` imperatively in-task; the adapter deferred.

Two commits close it by rendering in the click task (the source callbacks fire outside Angular CD, so a local `detectChanges()` is safe — the same philosophy as `RealLink`'s existing direct-DOM write):

- **`RouteView`** — `detectChanges()` after the route-node source updates, so the `@if (activeTemplate())` outlet swap commits in-task (route-switch navigations).
- **`injectRoute` / `injectRouteNode`** — sync-commit the consuming component on route change, so route-state displays (`{{ params.id }}`, active content, route name) commit in-task even when the outlet template doesn't swap (same-route param changes, RouteView-less views). Uses the cached route source (a shared subscription) and an optional `ChangeDetectorRef` (environment-context usage stays deferred).

Same-session A/B on the cross-router benchmark (Apple M3 Pro): `navMsWall` collapses to ≈ its CPU cost across every per-nav scenario — nav-latency **0.97 → 0.07 (~13×)**, active-links **0.73 → 0.08 (~9×)**, param-nav **0.77 → 0.10 (~8×)**, nested-switch **0.84 → 0.12 (~7×)**, nav-churn **1.02 → 0.08 (~13×)**. real-router now leads `@angular/router` on felt nav latency by ~3-13× (it was up to ~4× behind on the plain-link case). The route-view/leaf render simply lands in-task now, so CPU-metric sweeps tick up a few µs while staying 3-11× ahead. Behaviour is otherwise identical.
