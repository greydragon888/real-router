---
"@real-router/core": minor
---

Add `canDeactivate` support to `Route` and `RouteConfigUpdate` interfaces (#84)

Added `canDeactivate` support to `Route` and `RouteConfigUpdate` interfaces, closing the API asymmetry with `canActivate`. Routes can now declare deactivation guards declaratively at `addRoute()` and dynamically via `updateRoute()`.
