---
"@real-router/core": patch
---

Consume the promise of an async guard that a synchronous check asks (#2797)

`router.canNavigateTo()`, and `navigateToNotFound()` when it asks the departing route's `canDeactivate`, cannot wait for an async guard: its promise reads as "blocked". A guard whose promise then rejected — an async guard whose request failed — surfaced as an unhandled rejection, which ends a Node process under the default `--unhandled-rejections=throw`.

- The promise is consumed, so its rejection no longer escapes.
- Both checks answer as before: `canNavigateTo()` returns `false`, and `navigateToNotFound()` throws `CANNOT_DEACTIVATE`.
