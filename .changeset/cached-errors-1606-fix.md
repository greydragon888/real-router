---
"@real-router/core": minor
---

Never mutate a caught RouterError — re-code a copy; freeze the cached rejection singletons (#1606)

`rethrowAsRouterError` used to rewrite the caught error's `code` (and message) in place via `error.setCode(...)`. The three cached rejection errors (`SAME_STATES`, `ROUTE_NOT_FOUND`, `ROUTER_NOT_STARTED`) are module-level singletons, so a guard that merely awaited a navigation rejecting with one of them permanently poisoned that error's code for the whole process — every later consumer (user `.catch()`, every plugin's `onTransitionError`), across routers and SSR per-request clones, observed `CANNOT_ACTIVATE` / `CANNOT_DEACTIVATE` instead of the real code.

- A guard-thrown (or guard-propagated) `RouterError` is now re-coded on a **copy**: same `setCode` message semantics, `segment` / `path` / custom fields / `stack` carried over. The instance the guard threw is left untouched; the #933 carve-out (`RouterError(TRANSITION_CANCELLED)` passes through as-is) is unaffected.
- **Breaking change (pre-1.0).** The three cached rejection errors are now `Object.freeze`d as a backstop: an in-place write to one of them (e.g. `err.retried = true` in a `.catch()`) throws a `TypeError` in strict mode instead of silently corrupting the error every other consumer in the process sees. Treat caught navigation errors as read-only.
