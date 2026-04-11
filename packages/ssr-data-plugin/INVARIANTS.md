# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## Loader Invocation

| #   | Invariant                                                  | Description                                                                                                                                                                                    |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Loader called exactly once per `start()`                   | Each `router.start()` call invokes the matching loader exactly once, regardless of route or params. Prevents double-loading and confirms the start interceptor fires once per navigation.       |
| 2   | Loader not called when no route matches                    | When `start()` resolves to a route with no registered loader, the plugin does not invoke any loader. Prevents phantom loader calls for unregistered routes.                                     |

## Loader Arguments

| #   | Invariant                                                  | Description                                                                                                                                                                                    |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Loader receives correct route params                       | The `params` argument passed to the loader matches the params from the resolved state. Verifies that the plugin correctly forwards params from the transition, not stale or default values.     |

## Data Retrieval

| #   | Invariant                                                  | Description                                                                                                                                                                                    |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `state.context.data` contains loader result after `start()` | After `start()` completes, `state.context.data` contains exactly the value resolved by the loader. Confirms `claim.write()` correctly stores data on the state context across arbitrary loader return values. |
| 2   | `state.context.data` is `undefined` for unmatched routes    | When the started route has no loader, `state.context.data` is `undefined`. Verifies the claim does not leak data from previous navigations or other routes.                                                  |

## Teardown

| #   | Invariant                                                  | Description                                                                                                                                                                                    |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Teardown releases `"data"` namespace claim                 | After `unsubscribe()`, the `"data"` namespace claim is released. Prevents stale data writes and frees the namespace for other plugins.                                                         |

## Test Files

| File                                         | Invariants | Category                                                 |
| -------------------------------------------- | ---------- | -------------------------------------------------------- |
| `tests/property/ssr-data.properties.ts`      | 6          | Loader invocation, loader arguments, state.context.data retrieval, teardown |
