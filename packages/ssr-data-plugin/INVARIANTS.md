# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## Validation

| #   | Invariant                                                  | Description                                                                                                                                                                                    |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Non-objects rejected                                       | `validateLoaders()` throws `TypeError` for `null`, `undefined`, strings, numbers, booleans, and arrays. Only plain objects pass validation.                                                     |
| 2   | Non-function values rejected                               | `validateLoaders()` throws `TypeError` when any value in the loaders object is not a function. Prevents runtime errors during factory compilation.                                              |

## Loader Invocation

| #   | Invariant                                                  | Description                                                                                                                                                                                    |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Loader called exactly once per `start()`                   | Each `router.start()` call invokes the matching loader exactly once, regardless of route or params. Prevents double-loading and confirms the start interceptor fires once per navigation.       |
| 2   | Loader not called when no route matches                    | When `start()` resolves to a route with no registered loader, the plugin does not invoke any loader. Prevents phantom loader calls for unregistered routes.                                     |
| 3   | Factory called once per `usePlugin()`                      | Each loader factory function executes exactly once during `usePlugin()` (at compilation time), not on every `start()` call. The compiled loader is cached in a `Map` for reuse.                 |
| 4   | No caching                                                 | Each `start()` triggers a fresh loader call. N starts = N loader invocations. Caching is the caller's responsibility.                                                                          |

## Loader Arguments

| #   | Invariant                                                  | Description                                                                                                                                                                                    |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Loader receives correct route params                       | The `params` argument passed to the loader matches the params from the resolved state. Verifies that the plugin correctly forwards params from the transition, not stale or default values.     |

## Factory Arguments

| #   | Invariant                                                  | Description                                                                                                                                                                                    |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | getDependency is functional                                | The `getDependency` callback passed to loader factories returns the corresponding router dependency. Verifies the DI contract works end-to-end.                                                |

## Data Retrieval

| #   | Invariant                                                  | Description                                                                                                                                                                                    |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `state.context.data` contains loader result after `start()` | After `start()` completes, `state.context.data` contains exactly the value resolved by the loader. Confirms `claim.write()` correctly stores data on the state context across arbitrary loader return values. |
| 2   | `state.context.data` is `undefined` for unmatched routes    | When the started route has no loader, `state.context.data` is `undefined`. Verifies the claim does not leak data from previous navigations or other routes.                                                  |
| 3   | Prototype properties ignored                               | Loader keys inherited from the prototype chain are never compiled or invoked. Uses `Object.entries()` at compilation time, which only iterates own enumerable properties.                                     |

## Teardown

| #   | Invariant                                                  | Description                                                                                                                                                                                    |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Teardown releases `"data"` namespace claim                 | After `unsubscribe()`, the `"data"` namespace claim is released. Prevents stale data writes and frees the namespace for other plugins.                                                         |
| 2   | Namespace re-claimable after teardown                      | After `unsubscribe()`, calling `claimContextNamespace("data")` succeeds. Verifies that `claim.release()` actually removes the claim from the router's claim registry.                          |
| 3   | Factory compilation error releases claim                   | If a loader factory throws during compilation, the `"data"` namespace claim is released before the error propagates. Prevents permanently blocking the namespace.                               |
| 4   | Teardown idempotency                                       | Double `unsubscribe()` does not throw. The second call is a no-op (core guards with `unsubscribed` flag).                                                                                      |

## Isolation

| #   | Invariant                                                  | Description                                                                                                                                                                                    |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Per-instance data independence                             | Two cloned routers using the same factory produce independent `state.context.data`. Each `usePlugin()` creates its own `compiledLoaders` Map and context claim.                                 |

## Test Files

| File                                         | Invariants | Category                                                                            |
| -------------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `tests/functional/data-loader.test.ts`       | 3          | getDependency integration, no caching                                                                                     |
| `tests/property/ssr-data.properties.ts`      | 13         | Validation, loader invocation, loader arguments, data retrieval, prototype safety, teardown, isolation, factory invocation |
