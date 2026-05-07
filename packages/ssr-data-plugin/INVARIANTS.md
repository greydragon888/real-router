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

## SSR Mode

| #   | Invariant                                                  | Description                                                                                                                                                                                    |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `getSsrDataMode` reflects the resolved mode                 | For any string-form `ssr: SsrMode`, `getSsrDataMode(state) === ssr` after `start()`. Confirms the plugin writes the resolved mode to `state.context.ssrDataMode` for every registered route. |
| 2   | `client-only` skips the loader                              | When `ssr === "client-only"` (or `false`), the loader is invoked exactly 0 times per `start()`, and `state.context.data` is `undefined`. Symmetric on server and client.                       |
| 3   | Function-form resolver invoked once per `start()`           | A function-form `ssr: (state) => SsrMode` is called exactly once per navigation, with the resolved state. Result is the published mode.                                                       |
| 4   | Short form === `{ loader }` for mode `"full"`               | A factory `(r, getDep) => loader` and `{ loader: (r, getDep) => loader }` produce identical `state.context.data` and the same mode `"full"` after `start()`.                                  |

## Test Files

| File                                         | Invariants | Category                                                                            |
| -------------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `tests/functional/data-loader.test.ts`       | 3          | getDependency integration, no caching                                                                                     |
| `tests/property/ssr-data.properties.ts`      | 17         | Validation, loader invocation, loader arguments, data retrieval, prototype safety, teardown, isolation, factory invocation, **SSR mode (×4)** |
