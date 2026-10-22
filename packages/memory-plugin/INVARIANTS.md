# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

`historyIndex` below is `state.context.memory.historyIndex` of the state the router shows, `-1` when it shows none — the entry `canGoBack()` and `canGoForward()` count from once no `back()`/`forward()`/`go()` is in flight.

## Index Bounds

| #   | Invariant    | Description                                                                                                                                    |
| --- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Empty state  | When no navigations have occurred (after stop or before start), `historyIndex === -1` and `#entries.length === 0`.                             |
| 2   | Valid bounds | After any sequence of operations, `historyIndex === -1` (empty) or `0 <= historyIndex < #entries.length`.                                      |
| 3   | canGoBack    | `canGoBack()` returns `true` **if and only if** `historyIndex > 0` (strict bi-implication — verified for every action in an action sequence).  |
| 4   | canGoForward | `canGoForward()` returns `true` **if and only if** `historyIndex < #entries.length - 1` (strict bi-implication — indirectly via invariant #3). |

## History Size

| #   | Invariant         | Description                                                                                                |
| --- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| 5   | maxHistory cap    | When `maxHistoryLength > 0`, `#entries.length` never exceeds `maxHistoryLength` after any operation.       |
| 6   | Replace preserves | A `replace` navigation does not increase `#entries.length`. The replaced entry overwrites the current one. |
| 7   | Push increases    | A non-replace navigation increases `#entries.length` by 1 (or stays at `maxHistoryLength` after trim).     |

## Navigation Consistency

| #   | Invariant           | Description                                                                                            |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| 8   | Back decrements     | After a successful `back()`, `historyIndex` decreases by 1.                                            |
| 9   | Forward increments  | After a successful `forward()`, `historyIndex` increases by 1.                                         |
| 10  | Navigate-after-back | Navigating to a new route after `back()` truncates all entries after the current index before pushing. |

## Lifecycle

| #   | Invariant   | Description                                                                                     |
| --- | ----------- | ----------------------------------------------------------------------------------------------- |
| 11  | Stop resets | After `router.stop()`, `#entries.length === 0` and `historyIndex === -1`. Extensions remain callable. |

## State Context (`state.context.memory`)

| #   | Invariant                  | Description                                                                                                                                                                                                                                     |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12  | Push direction             | Every successful non-history navigation (including the first push from `router.start()`) writes `state.context.memory.direction === "navigate"`.                                                                                                 |
| 13  | Cap=1 idempotency          | With `maxHistoryLength === 1`, after any action sequence `canGoBack()` and `canGoForward()` are always `false` and `state.context.memory.historyIndex === 0`.                                                                                    |
| 14  | Back/forward round-trip    | For pushes of distinct paths without guards, `N × back()` followed by `N × forward()` lands on the same `path` as before the first `back()`. (Exception: the `entry.path === currentState.path` short-circuit — see [#508].)                      |

[#508]: https://github.com/greydragon888/real-router/issues/508

## Superseded Restore

| #   | Invariant                         | Description                                                                                                                                                                                                                                                                  |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15  | The newer navigation's end decides | A `back()`, `forward()` or `go()` a newer `navigate()` cancels while a guard holds it leaves the stack to that navigation's end, at once or after an async guard of its own: its push commits after the entry the restore moves to; a refusal or a quiet cancel leaves the stack on the entry the router shows, with `historyIndex` and the entries behind it unchanged ([#2802]). |

[#2802]: https://github.com/greydragon888/real-router/issues/2802

## Test Files

| File                                        | Invariants | Category                                         |
| ------------------------------------------- | ---------- | ------------------------------------------------ |
| `tests/property/memoryPlugin.properties.ts` | 1–14       | Index bounds, history size, navigation, context  |
| `tests/property/superseded-restore.properties.ts` | 15   | Superseded restore                               |
| `tests/property/helpers.ts`                 | —          | Shared arbitraries and router factory            |

> **Concurrency note.** Invariants #2 (valid bounds) and #12 (push direction) also hold under a **concurrent async-guard race** — a `back()` / `go(-N)` whose target has an async `canActivate` guard, cancelled by a concurrent `navigate()` that commits first. The synchronous property arbitraries cannot generate this interleaving (it is the residual of #807 that shipped, [#1234] — the flag/`#index` were consumed/reverted by timing, not identity); it is stress-verified in `tests/stress/async-guard-back-navigate-race.stress.ts` ([#1235]).

[#1234]: https://github.com/greydragon888/real-router/issues/1234
[#1235]: https://github.com/greydragon888/real-router/issues/1235
