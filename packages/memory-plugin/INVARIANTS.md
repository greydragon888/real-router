# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## Index Bounds

| #   | Invariant    | Description                                                                                                  |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------ |
| 1   | Empty state  | When no navigations have occurred (after stop or before start), `#index === -1` and `#entries.length === 0`. |
| 2   | Valid bounds | After any sequence of operations, `#index === -1` (empty) or `0 <= #index < #entries.length`.                |
| 3   | canGoBack    | `canGoBack()` returns `true` if and only if `#index > 0`.                                                    |
| 4   | canGoForward | `canGoForward()` returns `true` if and only if `#index < #entries.length - 1`.                               |

## History Size

| #   | Invariant         | Description                                                                                                |
| --- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| 5   | maxHistory cap    | When `maxHistoryLength > 0`, `#entries.length` never exceeds `maxHistoryLength` after any operation.       |
| 6   | Replace preserves | A `replace` navigation does not increase `#entries.length`. The replaced entry overwrites the current one. |
| 7   | Push increases    | A non-replace navigation increases `#entries.length` by 1 (or stays at `maxHistoryLength` after trim).     |

## Navigation Consistency

| #   | Invariant           | Description                                                                                            |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| 8   | Back decrements     | After a successful `back()`, `#index` decreases by 1.                                                  |
| 9   | Forward increments  | After a successful `forward()`, `#index` increases by 1.                                               |
| 10  | Navigate-after-back | Navigating to a new route after `back()` truncates all entries after the current index before pushing. |

## Lifecycle

| #   | Invariant   | Description                                                                                     |
| --- | ----------- | ----------------------------------------------------------------------------------------------- |
| 11  | Stop resets | After `router.stop()`, `#entries.length === 0` and `#index === -1`. Extensions remain callable. |

## Test Files

| File                                        | Invariants | Category                               |
| ------------------------------------------- | ---------- | -------------------------------------- |
| `tests/property/memoryPlugin.properties.ts` | 1–11       | Index bounds, history size, navigation |
| `tests/property/helpers.ts`                 | —          | Shared arbitraries and router factory  |
