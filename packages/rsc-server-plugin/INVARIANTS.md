# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## Validation

| #   | Invariant                    | Description                                                                                                                                  |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Non-objects rejected         | `validateLoaders()` throws `TypeError` for `null`, `undefined`, strings, numbers, booleans, and arrays. Only plain objects pass validation.  |
| 2   | Non-function values rejected | `validateLoaders()` throws `TypeError` when any value in the loaders object is not a function. Prevents runtime errors during compilation. |

## Loader Invocation

| #   | Invariant                                | Description                                                                                                                                                              |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3   | Loader called exactly once per `start()` | Each `router.start()` call invokes the matching loader exactly once, regardless of route or params. Prevents double-loading and confirms the start interceptor fires once. |
| 4   | Loader not called when no route matches  | When `start()` resolves to a route with no registered loader, the plugin does not invoke any loader. Prevents phantom loader calls.                                     |
| 5   | Factory called once per `usePlugin()`    | Each loader factory function executes exactly once during `usePlugin()` (at compilation time), not on every `start()`. The compiled loader is cached in a `Map`.        |
| 6   | No caching                               | Each `start()` triggers a fresh loader call. N starts = N loader invocations. Caching is the caller's responsibility.                                                 |

## Loader Arguments

| #   | Invariant                            | Description                                                                                                                                                |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | Loader receives correct route params | The `params` argument passed to the loader matches the params from the resolved state. Verifies that the plugin correctly forwards params from the transition. |

## Data Retrieval

| #   | Invariant                                                  | Description                                                                                                                                                                  |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8   | `state.context.rsc` contains loader result after `start()` | After `start()` completes, `state.context.rsc` contains exactly the value resolved by the loader. Verifies `claim.write()` correctly stores the ReactNode on the state context. |
| 9   | `state.context.rsc` is `undefined` for unmatched routes    | When the started route has no loader, `state.context.rsc` is `undefined`. Verifies the claim does not leak data from previous navigations.                                  |
| 10  | Prototype properties ignored                               | Loader keys inherited from the prototype chain are never compiled or invoked. Uses `Object.entries()` at compilation time.                                                  |

## Teardown

| #   | Invariant                                | Description                                                                                                                                                  |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 11  | Teardown releases `"rsc"` namespace claim | After `unsubscribe()`, the `"rsc"` namespace claim is released. Prevents stale writes and frees the namespace for other plugins.                            |
| 12  | Namespace re-claimable after teardown    | After `unsubscribe()`, calling `claimContextNamespace("rsc")` succeeds. Verifies that `claim.release()` actually removes the claim from the registry.        |
| 13  | Factory compilation error releases claim | If a loader factory throws during compilation, the `"rsc"` namespace claim is released before the error propagates. Prevents permanently blocking the namespace. |

## Composition

| #   | Invariant                                                              | Description                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14  | `rsc-server-plugin` + `ssr-data-plugin` populate independently          | Registering both plugins on the same router populates `state.context.rsc` (ReactNode) and `state.context.data` (JSON) for the same `start()` call without cross-namespace mutation. Distinct namespaces (`"rsc"` vs `"data"`) coexist in `claimContextNamespace`. |
| 15  | Tearing down one plugin does not invalidate the other's claim          | When one of the two plugins is unsubscribed, the other's namespace remains claimed and continues populating `state.context.<ns>` on subsequent `start()` calls. The freed namespace is re-claimable; the held namespace still throws on re-claim attempt. |

## Test Files

| File                                          | Invariants | Category                                                                                                                                                |
| --------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/functional/rsc-loader.test.ts`         | full       | All categories — loader semantics, validation, teardown, error paths, ReactNode variants, sync/async, DI                                                |
| `tests/property/rsc.properties.ts`            | 15         | Validation, loader invocation, loader arguments, data retrieval, prototype safety, teardown, isolation, factory invocation, **composition with ssr-data-plugin** |
| `tests/stress/*.stress.ts`                    | runtime    | Per-request isolation, error handling, concurrent loaders, slow loaders, full lifecycle churn                                                          |
