---
"@real-router/core": minor
---

Honor `Promise<State>` contract for `navigateToDefault()` synchronous errors (#471)

`navigateToDefault()` is declared to return `Promise<State>`, but synchronous exceptions thrown by `deps.resolveDefault()` (e.g., a `DefaultRouteCallback` that throws, or a validator that rejects a callback's return value) escaped the Promise chain and surfaced as uncaught sync exceptions on the call site.

The body of `navigateToDefault()` now wraps `resolveDefault()` in a try/catch and converts synchronous throws into `Promise.reject`, so callers can uniformly handle errors via `.catch()` / `await`.

Internal hook for `@real-router/validation-plugin`: new `RouterValidator.options.validateResolvedDefaultRoute(routeName, store)`, invoked from `resolveDefault()` when `options.defaultRoute` is a callback.
