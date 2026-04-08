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
| 1   | `getRouteData()` returns loader result after `start()`     | After `start()` completes, `getRouteData()` returns exactly the value resolved by the loader. Confirms the data store correctly maps state to data across arbitrary loader return values.       |
| 2   | `getRouteData()` returns `null` for unmatched routes       | When the started route has no loader, `getRouteData()` returns `null`. Verifies the data store does not leak data from previous navigations or other routes.                                    |

## Teardown

| #   | Invariant                                                  | Description                                                                                                                                                                                    |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Teardown removes `getRouteData` extension                  | After `unsubscribe()`, the `getRouteData` method is removed from the router instance. Prevents stale data access after plugin removal.                                                         |

## Test Files

| File                                         | Invariants | Category                                                 |
| -------------------------------------------- | ---------- | -------------------------------------------------------- |
| `tests/property/ssr-data.properties.ts`      | 6          | Loader invocation, loader arguments, data retrieval, teardown |
