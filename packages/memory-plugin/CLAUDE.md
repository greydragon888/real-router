# @real-router/memory-plugin

> In-memory history engine for Real-Router — back/forward/go navigation without browser History API

## Exports

| Export                 | Type            | Description                                      |
|------------------------|-----------------|--------------------------------------------------|
| `memoryPluginFactory`  | `PluginFactory` | Factory function, accepts `MemoryPluginOptions`  |
| `MemoryPluginOptions`  | Type            | `{ maxHistoryLength?: number }`                  |
| `MemoryContext`        | Type            | `{ direction, historyIndex }` — published on `state.context.memory` |
| `MemoryDirection`      | Type            | `"back" \| "forward" \| "navigate"`              |

Module augmentation adds to `Router`: `back()`, `forward()`, `go(delta)`, `canGoBack()`, `canGoForward()`; and `memory?: MemoryContext` to `StateContext`.

## Module Structure

```
src/
├── factory.ts   — memoryPluginFactory: validates maxHistoryLength, freezes options,
│                  returns PluginFactory closure that creates MemoryPlugin instance
├── plugin.ts    — MemoryPlugin class: manages history entries array + index,
│                  exposes getPlugin() returning { onTransitionStart, onTransitionSuccess,
│                  onStop, teardown }
├── types.ts     — MemoryPluginOptions, MemoryContext, MemoryDirection
└── index.ts     — Public exports + Router module augmentation (back/forward/go/canGoBack/canGoForward)
```

## Gotchas

### Snapshot semantics for back/forward (#561)

`back()`/`forward()`/`go(delta)` commit the **State stored at original navigation time** via `getPluginApi(router).navigateToState`. They do NOT re-resolve via current rules — `forwardState` interceptors do not re-fire, and `routes.update()` / `routes.replace()` between record and replay leaves stored entries immune. This matches the contract URL plugins (browser/hash/navigation) follow post-#525.

Implications:

- Dynamic `forwardFn` evaluated only at original visit. If world state changed (e.g. user logged out), the snapshot of `/admin` is committed even though `forwardFn` would now redirect to `/login`. **Use `canActivate` for current-world checks** — guards still run on every replay and can reject.
- `routes.update("users", { defaultParams: ... })` between record and replay: stored entry keeps original defaults; replay commits original snapshot.
- Removed routes (`routes.remove("users")` after recording) → `navigateToState` rejects with `ROUTE_NOT_FOUND` before the navigation starts, and the stack does not move.
- Interceptors do NOT run on back/forward — same contract as popstate-based URL plugins. `persistent-params-plugin`'s contribution was applied at original navigation time via the `forwardState` seam and is preserved through the stored entry's channels.

### `back()`/`forward()`/`go()` are fire-and-forget

These methods return `void`, not `Promise`. They call `getPluginApi(router).navigateToState` internally (async) but discard the promise via `void`. To detect completion, subscribe to state changes before calling.

### The stack position follows a restore while its navigation runs

`canGoBack()`/`canGoForward()` and the next `back()`/`forward()`/`go()` read one position: the entry the restore in flight moves to, else the entry the router shows. A restore moves it once its navigation is announced (`onTransitionStart`, which fires inside the `navigateToState` call), so while that navigation is in flight they reflect the **intended target**. It stops moving it when that navigation fails — a guard block (`CANNOT_ACTIVATE`), a quiet cancel — and the position is again the entry the router shows. Nothing is reverted, so no failure restores an index that another navigation has moved since.

A refusal before the navigation is announced never moves the position: the facade's synchronous refusal of a nested navigation (#1610), which `back()` from inside a `router.subscribe` listener meets, or `ROUTE_NOT_FOUND` for an entry whose route was removed (#1803). It matters more than a misreported `canGoBack()`: the position is where the next push truncates `#entries`, so a stale one deletes the entry the user is standing on.

A newer restore that starts takes the position over, and the one it cancelled leaves it alone: two quick `back()` calls whose second is refused leave the stack on the entry the router shows. A navigation that commits over a restore still in flight applies to the entry that restore moves to — its push truncates after it, its replace overwrites it ([#1234]). `stop()` and teardown drop the restore in flight with the stack ([#505]).

⚠ A navigation that cancels a held restore and then waits on an async guard of its own commits after the restore's rejection has run, so it applies to the entry the router shows: whether it pushes after the restore's target or after the shown entry depends on whether it commits synchronously.

[#1234]: https://github.com/greydragon888/real-router/issues/1234
[#505]: https://github.com/greydragon888/real-router/issues/505

### A restore's commit is recognised by its own navigation

Each `back()`/`forward()`/`go()` files a record — its target index and its direction — under the `context` of the navigation it starts, from `onTransitionStart` while the call is running; every navigation's state gets a `context` of its own, and the committed state carries the one its start announced. `onTransitionSuccess` takes a commit carrying a record as that restore's: no push, the record's `direction` and `historyIndex`. Any other commit is a `navigate()`'s and takes the normal push or replace branch. The restore navigation is also tagged `source: MEMORY_RESTORE`, as the browser/hash URL plugins tag theirs; the tag is the same on every restore, so it does not say which one a commit belongs to.

Not by timing, because both timing rules fail. A reset on a microtask lets a `navigate()` fired in the **same tick** as `back()` be swallowed as a phantom history-restore ([#807]); consuming on "the first commit after the flag was set" mis-fires when an async `canActivate` on the back target keeps the restore in flight and a concurrent `navigate()` commits first ([#1234]). Nor by a tag every restore carries: a `back()` refused synchronously inside another restore's announce, or a second `back()` while the first is held, then takes the other restore's commit for its own. A restore started inside another one's announce leaves the outer one staged, so that one still files its record.

[#807]: https://github.com/greydragon888/real-router/issues/807

### `maxHistoryLength` rejects invalid values at factory time

Accepts: non-negative integers. Rejects (throws `TypeError`): negatives, `NaN`, `±Infinity`, fractional numbers, non-numbers. Zero (`0`) is a **sentinel meaning "unlimited"** — trimming is disabled (`0 > 0` is false). The default is `1000`.

### `go(0)` / `go(NaN)` / `go(±Infinity)` / `go(0.5)` are no-ops

`#go(delta)` guards against zero, non-integer, and non-finite input. Passing any of `0`, `NaN`, `±Infinity`, or fractional deltas returns immediately without calling `api.navigateToState` — silent no-op, no throw; a non-integer `targetIndex` would otherwise read a missing slot and throw on `.path`. The check is `!Number.isInteger(delta) || delta === 0`.

### `back()`/`forward()` to entry with same path → sync position update + context rewrite

When `back(-1)` or `forward(+1)` would land on a history entry whose `path` equals the router's current state path (e.g. history `[home, home]` with `back()` from index 1), `#go(delta)` short-circuits: the stack lands on that entry **synchronously** and no `api.navigateToState` call is made. `canGoBack()`/`canGoForward()` immediately reflect it.

`state.context.memory` is rewritten in place during the short-circuit — `direction` is set to `"back"` or `"forward"` and `historyIndex` to the new position. The state object identity is preserved (same reference as before), but its `context.memory` payload is current, so a **synchronous** `router.getState().context.memory` read right after `back()`/`forward()` reflects the new direction/index (fix for #508).

The short-circuit holds only while no restore is in flight: one in flight is about to move the router off that path. Then the entry is restored with `force`, which supersedes the restore in flight and keeps the same state from being refused `SAME_STATES` — a `back(); back()` whose first restore an async guard holds ends on the second's entry.

**No `TRANSITION_SUCCESS` is emitted on a short-circuit**, however — it returns before `api.navigateToState`. So `router.subscribe` listeners and framework adapters (`@real-router/sources` + `useSyncExternalStore`, keyed on `TRANSITION_SUCCESS`) are **not** notified and do not re-render: a same-path `back()`/`forward()` is a metadata-only move (the visible route is unchanged). Event-based consumers observe the updated `context.memory` only on the next emitted transition (#808).

### `replace` option replaces current entry

When `router.navigate(name, params, undefined, { replace: true })` succeeds, the current history entry is overwritten instead of pushing a new one. If the history is empty, replace falls through to normal push.

### `onStop` clears history, `teardown` clears history AND removes extensions

`router.stop()` → `onStop` → clears entries and the position, the restore in flight with them. Extensions remain callable and work correctly — `canGoBack()`/`canGoForward()` return `false`, `back()`/`forward()` are no-ops (target index out of bounds).
`unsubscribe()` → `teardown` → removes `back`/`forward`/`go`/`canGoBack`/`canGoForward` from router, then clears.
