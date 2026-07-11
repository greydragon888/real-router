---
"@real-router/logger": patch
---

fix(logger): isolate an async callback rejection instead of leaking a Node unhandledRejection (#1161)

`#invokeCallback` wrapped the user callback in a `try/catch` that isolated only
**synchronous** throws. An async callback (a `(...) => Promise<void>` is assignable
to the void-typed `LogCallback`, no cast) had its returned Promise discarded, so a
rejection surfaced as a Node `unhandledRejection` — process-fatal under
`--unhandled-rejections=strict` (Node 22+ default), reachable on the documented
async-analytics callback and via `createRouter(routes, { logger: { callback: asyncFn } })`.

The callback's runtime return is now read, duck-checked for a thenable, and its
rejection routed to the same `console.error` sink a sync throw uses (`[Logger] Error
in async callback:`) — mirroring core's `subscribe` isolation (#944). No API change.
