---
"@real-router/lifecycle-plugin": minor
---

Isolate a throwing hook factory so it no longer swallows onNavigate (#1222)

`runHook(compileHook(...))` evaluated the `compileHook` factory call as its **argument** — before `runHook`'s try/catch — so a throwing hook FACTORY (the common `onEnter: (r, getDep) => { const svc = getDep("x"); return (to) => {…} }` DI shape, where init fails) escaped the #798 per-hook isolation. It aborted the handler before the sibling `onNavigate` line and, because a failed compile is never cached, re-threw and re-swallowed on **every** navigation to the route. The compile now runs INSIDE `runHook`'s try (`runHook(hookName, routeName, …)`), covering all four hook sites (`isolate(produce())` → `isolate(recipe)`).

**Behavioural change:** a throwing hook factory now surfaces its error **asynchronously** (re-thrown via `queueMicrotask`, uncaught) — the same channel as a throwing hook body (#798) — instead of synchronously through the core "Error in listener" EventEmitter sink. This unifies the two user-code fault channels; a consumer that relied on the factory error reaching the sync sink (or on `onNavigate` being skipped) will observe the new async channel and the now-firing `onNavigate`.
