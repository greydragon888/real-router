---
"@real-router/validation-plugin": minor
---

Validate `defaultRoute` resolves to an existing route (#471)

`validationPlugin` now verifies that `options.defaultRoute` points to a route that actually exists in the route tree:

- **Static string `defaultRoute`** — checked at `router.usePlugin(validationPlugin())` time. A non-existent name throws immediately with `[validation-plugin] defaultRoute resolved to non-existent route: "<name>"`.
- **`DefaultRouteCallback`** — checked at runtime inside `resolveDefault()` on every `navigateToDefault()` / `start()` invocation. A callback that returns a non-existent route name surfaces as `Promise.reject` from `navigateToDefault()` with the same error message instead of the previous opaque `ROUTE_NOT_FOUND`.

Callbacks are **not** probed at registration time — their return value depends on dependencies that may not be registered yet. The runtime check guarantees that a bad return value is diagnosed on first navigation with a pointer to the callback as the source, rather than the generic `ROUTE_NOT_FOUND` at an unrelated call site.
