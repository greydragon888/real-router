# @real-router/memory-plugin

> In-memory history engine for Real-Router — back/forward/go navigation without browser History API

## Exports

| Export                 | Type            | Description                                      |
|------------------------|-----------------|--------------------------------------------------|
| `memoryPluginFactory`  | `PluginFactory` | Factory function, accepts `MemoryPluginOptions`  |
| `MemoryPluginOptions`  | Type            | `{ maxHistoryLength?: number }`                  |

Module augmentation adds to `Router`: `back()`, `forward()`, `go(delta)`, `canGoBack()`, `canGoForward()`.

## Module Structure

```
src/
├── factory.ts   — memoryPluginFactory: validates maxHistoryLength, freezes options,
│                  returns PluginFactory closure that creates MemoryPlugin instance
├── plugin.ts    — MemoryPlugin class: manages history entries array + index,
│                  exposes getPlugin() returning { onTransitionSuccess, onStop, teardown }
├── types.ts     — MemoryPluginOptions, MemoryContext, MemoryDirection
└── index.ts     — Public exports + Router module augmentation (back/forward/go/canGoBack/canGoForward)
```

## Gotchas

### Snapshot semantics for back/forward (#561)

`back()`/`forward()`/`go(delta)` commit the **State stored at original navigation time** via `getPluginApi(router).navigateToState`. They do NOT re-resolve via current rules — `forwardState`/`buildPath` interceptors do not re-fire, and `routes.update()` / `routes.replace()` between record and replay leaves stored entries immune. This matches the contract URL plugins (browser/hash/navigation) follow post-#525.

Implications:

- Dynamic `forwardFn` evaluated only at original visit. If world state changed (e.g. user logged out), the snapshot of `/admin` is committed even though `forwardFn` would now redirect to `/login`. **Use `canActivate` for current-world checks** — guards still run on every replay and can reject.
- `routes.update("users", { defaultParams: ... })` between record and replay: stored entry keeps original defaults; replay commits original snapshot.
- Removed routes (`routes.remove("users")` after recording) → `navigateToState` rejects with `ROUTE_NOT_FOUND`; `#go`'s reject handler reverts `#index`.
- `buildPath` interceptors do NOT run on back/forward — same contract as popstate-based URL plugins. `persistent-params-plugin`'s contribution was applied at original navigation time via the `forwardState` interceptor and is preserved through `state.params` in the stored entry.

### `back()`/`forward()`/`go()` are fire-and-forget

These methods return `void`, not `Promise`. They call `getPluginApi(router).navigateToState` internally (async) but discard the promise via `void`. To detect completion, subscribe to state changes before calling.

### `#index` is optimistic; reject handler reverts on guard block

`#go(delta)` updates `#index` **synchronously** before firing `api.navigateToState`. If the navigation is blocked (guard returns `false`, `CANNOT_ACTIVATE`), the `.catch()` reject handler reverts `#index` to its previous value. This means `canGoBack()`/`canGoForward()` reflect the **intended target** while navigation is in flight and revert to the correct state on failure.

A `#goGeneration` counter protects against superseded reverts: if a second `#go()` runs before the first settles, the first reject handler finds a mismatch and skips the revert — so the second call's optimistic target wins.

The `.catch()` reverts `#index` **only when it is still the optimistic target** (`#index === targetIndex`). A concurrent `navigate()` that cancelled a deep `go(-N)` has already re-based `#index` via its own push, so a blind revert to `previousIndex` would push it out of bounds ([#1234]) — the identity check keeps the stack in bounds. Same principle as the `navigatingFromHistory` flag below: act on settle only if the state is still ours.

[#1234]: https://github.com/greydragon888/real-router/issues/1234

### `navigatingFromHistory` flag prevents double-recording — consumed by identity, not timing

When `back()`/`forward()`/`go()` navigate, `onTransitionSuccess` skips pushing a new entry because `#navigatingFromHistory` is `true`. The restore navigation is tagged `source: MEMORY_RESTORE` (the same `source` convention the browser/hash URL plugins use), and the flag is consumed **only when the committing navigation carries that tag** — attributing it to the navigation that set it, by **identity**, not by timing.

This closes two faces of one root. #807 first moved the reset off a microtask into `onTransitionSuccess` (core commits `navigateToState` synchronously, so a `navigate()` fired in the **same tick** as `back()` otherwise saw the stale flag and was swallowed as a phantom history-restore — no push, stale `direction`/`historyIndex`, orphan forward leg). But timing-based consumption ("the first commit after the flag was set") still mis-fired when an async `canActivate` on the back target kept the restore in flight and a concurrent `navigate()` committed first — [#1234]. The `source` tag fixes both: a foreign commit falls through to the normal push branch; only the plugin's own tagged restore consumes the flag.

A guard-blocked, rejected, or cancelled replay never consumes the flag in `onTransitionSuccess`, so the `.catch()` handler clears it (gated by the `#goGeneration` guard so an older superseded `#go` no-ops on settle). See the `#index` gotcha above for how the same `.catch()` reverts the optimistic index by the same identity check.

[#807]: https://github.com/greydragon888/real-router/issues/807

### `maxHistoryLength` rejects invalid values at factory time

Accepts: non-negative integers. Rejects (throws `TypeError`): negatives, `NaN`, `±Infinity`, fractional numbers, non-numbers. Zero (`0`) is a **sentinel meaning "unlimited"** — trimming is disabled (`0 > 0` is false). The default is `1000`.

### `go(0)` / `go(NaN)` / `go(±Infinity)` / `go(0.5)` are no-ops

`#go(delta)` guards against zero, non-integer, and non-finite input. Passing any of `0`, `NaN`, `±Infinity`, or fractional deltas returns immediately without calling `api.navigateToState` — silent no-op, no throw. (Earlier versions crashed with `TypeError: Cannot read properties of undefined (reading 'path')` when `targetIndex` landed on a non-integer slot.) The check is `!Number.isInteger(delta) || delta === 0`.

### `back()`/`forward()` to entry with same path → sync `#index` update + context rewrite

When `back(-1)` or `forward(+1)` would land on a history entry whose `path` equals the router's current state path (e.g. history `[home, home]` with `back()` from index 1), `#go(delta)` short-circuits: `#index` is updated **synchronously** and no `api.navigateToState` call is made. `canGoBack()`/`canGoForward()` immediately reflect the new index.

`state.context.memory` is rewritten in place during the short-circuit — `direction` is set to `"back"` or `"forward"` and `historyIndex` to the new `#index` value. The state object identity is preserved (same reference as before), but its `context.memory` payload is current, so a **synchronous** `router.getState().context.memory` read right after `back()`/`forward()` reflects the new direction/index (fix for #508).

**No `TRANSITION_SUCCESS` is emitted on a short-circuit**, however — it returns before `api.navigateToState`. So `router.subscribe` listeners and framework adapters (`@real-router/sources` + `useSyncExternalStore`, keyed on `TRANSITION_SUCCESS`) are **not** notified and do not re-render: a same-path `back()`/`forward()` is a metadata-only move (the visible route is unchanged). Event-based consumers observe the updated `context.memory` only on the next emitted transition (#808). (Earlier docs wrongly claimed subscribers "receive the same signal" for short-circuit moves — they receive zero events.)

### `replace` option replaces current entry

When `router.navigate(name, params, undefined, { replace: true })` succeeds, the current history entry is overwritten instead of pushing a new one. If `#index` is `-1` (empty history), replace falls through to normal push.

### `onStop` clears history, `teardown` clears history AND removes extensions

`router.stop()` → `onStop` → clears entries + resets index. Extensions remain callable and work correctly — `canGoBack()`/`canGoForward()` return `false`, `back()`/`forward()` are no-ops (target index out of bounds).
`unsubscribe()` → `teardown` → removes `back`/`forward`/`go`/`canGoBack`/`canGoForward` from router, then clears.
