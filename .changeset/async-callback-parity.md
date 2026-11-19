---
"@real-router/core": minor
---

Handle the promise an `async` plugin `teardown`, `subscribeChanges` or `subscribeDiagnostic` handler, or check returns (#2836)

**Breaking Change:** a check registered with `getPluginApi(router).addCheck()` that returns a thenable — an `async` check, whether its promise rejects or resolves — now refuses every call that reaches its position with `TypeError: [router] Async checks are not supported: the check at "<position>" returned a thenable. A check refuses by throwing synchronously.` The refusal leaves the door the way a synchronous throw of that check does, the checks after it at that position do not run, and its promise is consumed without a report. Before, the door went on as if the check had passed, and a rejection was an unhandled rejection.

**Migration:** throw from the check synchronously. A decision that has to wait for a promise cannot be a check; for a navigation, an async guard can wait for it.

- A plugin's `teardown` whose returned promise rejects is logged with the line a synchronous throw on the same path gets: `[router] Error during cleanup:` when its unsubscribe or `router.dispose()` removes the plugin, `[router.usePlugin] Cleanup error:` when the `usePlugin` call tears it down itself. Nothing waits for the promise, so the line comes after the call has returned. Before, the rejection was an unhandled rejection, which ends a Node process under the default `--unhandled-rejections=throw`.
- A `getRoutesApi(router).subscribeChanges()` or `getPluginApi(router).subscribeDiagnostic()` handler whose returned promise rejects is logged as `[router] Error in listener for <EVENT>:`, the line its synchronous throw gets, once the promise settles; the mutation or the operation that reported is unaffected. The rejected promise of an `async` diagnostic handler, which the notes of 0.163.0–0.166.0 leave unisolated, is isolated now.
- These failures reach the router's logger instead of `unhandledrejection`, under the same logger settings as a synchronous throw at the same place: an error tracker that read them there reads them from `logger.callback` now.
- A thenable that starts its work only when its `then` is called — a query builder, for one — returned from one of these slots now starts, because core calls its `then`. Returned from a check, it starts and the door refuses.
- The types are unchanged.
