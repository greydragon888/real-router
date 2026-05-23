---
"@real-router/core": patch
---

Snapshot leave-listeners before emit and freeze the leave payload (#662)

Two one-line fixes in `EventBusNamespace.awaitLeaveListeners`:

1. `for (const listener of [...this.#leaveListeners])` — a listener that
   reentrantly calls `subscribeLeave(newFn)` or its own `unsubscribe()` no
   longer affects the current emit cycle. Symmetric with the EventEmitter
   snapshot invariant landed in #659/#666.
2. `Object.freeze(leaveState)` — the `{ route, nextRoute, signal }` payload
   passed to leave listeners is now frozen. Mutation attempts on the wrapper
   (`payload.extra = …`, `payload.route = null`) throw in strict mode.
   `payload.route` / `payload.nextRoute` were already deep-frozen via the
   State immutability invariant; this closes the wrapper-mutation gap.

JSDoc on `EventBusNamespace.subscribe` / `subscribeLeave` / `addEventListener`
documents the duplicate-registration contract:

- `addEventListener` (plugin API) — strict, throws on same-reference duplicate.
- `subscribe` (end-user) — independent, fires N times for N registrations.
- `subscribeLeave` (end-user) — independent registrations; `unsubscribe` uses
  `indexOf` semantics so net effect is correct but physical slot ordering
  differs from call order (irrelevant unless you reflect on the internal array).

Wiki pages (`subscribe.md`, `leave.md`, `addEventListener.md`) updated to
match. No behaviour change for `subscribe` or `addEventListener`.
