---
"@real-router/core": patch
---

Isolate async `subscribe` listener rejections instead of leaking them (#944)

An `async` `router.subscribe()` listener whose Promise rejected leaked a Node `unhandledRejection` — process-fatal under `--unhandled-rejections=strict` (the Node 22+ default). The subscribe wrapper discarded the listener's return value, and the `EventEmitter`'s per-listener `try/catch` isolates only **synchronous** throws. The wrapper now attaches a `.catch` that routes a rejection to the same `onListenerError` sink a synchronous throw flows through — symmetric with `subscribeLeave`, which isolates rejections via `Promise.allSettled`. `subscribe` stays fire-and-forget: the listener's return value is ignored and `navigate()` does not await it.
