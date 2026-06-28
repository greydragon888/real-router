---
"@real-router/preload-plugin": patch
---

Isolate synchronous throws / non-Promise returns from a preload function (#806)

The fire-and-forget call `preload.fn(params).catch(() => {})` only caught a **promise rejection**. A `preload` function that threw synchronously — or returned a non-Promise — escaped before `.catch`, surfacing as an `uncaughtException` from the `setTimeout` callback (a global uncaught with no user code in the stack, hard to diagnose), despite the documented "errors silently caught" contract. Both timers now route through a shared `#runPreload` that guards the synchronous call with `try/catch` and normalizes the return via `Promise.resolve` before attaching `.catch`.
