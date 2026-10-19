---
"@real-router/lifecycle-plugin": minor
---

Hooks receive an `AbortSignal` that aborts when their work is no longer wanted (#2692)

Every hook is now called as `(toState, fromState, signal)`, and the signal's lifetime follows what the hook answers:

- `onStay`, `onNavigate` and `onLeave` answer one navigation, so their signal aborts when the next navigation commits — a param or search change on the same route included. Passed to a load, it cancels the request for `?q=a` before the request for `?q=b` starts, so an older, slower response no longer lands after a newer one.
- `onEnter` answers the visit, so its signal aborts when the route is left. It survives a param or search change, a `reload: true` navigation and a `replace()` revalidation of the same route.
- `router.stop()`, `router.dispose()` and removing the plugin abort every signal.

A navigation that does not commit — refused by a guard, failed, cancelled, or to the current state — aborts none: the user stays on the route. A commit aborts the signals it supersedes before any of its own hooks runs. A `getRoutesApi(router).replace()` that drops the active route aborts the route's signals although its `onLeave` no longer runs, so cleanup tied to `onEnter`'s signal does not depend on the route's definition. The reason is a fresh `DOMException` named `AbortError`, the value `fetch` rejects with. A commit that runs no hook opens no `AbortController`.

**Type change.** `LifecycleHook` declares the third parameter. A hook written with fewer parameters still compiles; code that calls a `LifecycleHook` itself with two arguments no longer does and has to pass a signal, and a two-parameter function asserted `as` an intersection with `LifecycleHook` is reported as a conversion that may be a mistake — attach the extra members with `Object.assign` instead.
