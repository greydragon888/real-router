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

## Revalidation channel (`invalidate`)

| #   | Invariant                                                  | Description                                                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 20  | Per-namespace orthogonality of `invalidate(...)`             | Marking `"data"` via `invalidate(router, "data")` never triggers the rsc loader, and marking `"rsc"` via `invalidate(router, "rsc")` never triggers the data loader. Each plugin's `subscribeLeave` listener gates on `isStale(router, <own-namespace>)`. Symmetric, exercised by a randomised interleaving of marks under one router.   |

## SSR Mode

| #   | Invariant                                                  | Description                                                                                                                                                                                  |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 16  | `getSsrRscMode` reflects the resolved mode                  | For any string-form `ssr: RscSsrMode` (`"full"` or `"client-only"`), `getSsrRscMode(state) === ssr` after `start()`. The plugin writes mode to `state.context.ssrRscMode` for every entry. |
| 17  | `client-only` skips the loader                              | When `ssr === "client-only"` (or `false`), the loader is invoked exactly 0 times per `start()`, and `state.context.rsc` is `undefined`. Symmetric on server and client.                    |
| 18  | Function-form resolver invoked once per `start()`           | A function-form `ssr: (state) => RscSsrMode` is called exactly once per navigation, with the resolved state.                                                                              |
| 19  | Short form === `{ loader }` for mode `"full"`               | A factory `(r, getDep) => loader` and `{ loader: (r, getDep) => loader }` produce identical `state.context.rsc` and the same mode `"full"` after `start()`.                                 |
| 21  | `getSsrRscMode` is idempotent under double application       | For any state `s`, `getSsrRscMode(stateWith({ ssrRscMode: getSsrRscMode(s) })) === getSsrRscMode(s)`. The function is a closed map into `ALLOWED_RSC_MODES`; re-feeding its output never shifts the mode. Guards against regressions that double-validate or chain a fallback under the read. |
| 28  | `getSsrRscMode` is closed-set: result ∈ `ALLOWED_RSC_MODES`  | For ANY `state.context.ssrRscMode` input (typed write, TS-cast bypass, foreign writer), the returned value is one of `ALLOWED_RSC_MODES`. The defensive-read contract — never leaks an out-of-set value downstream. Complements Inv 16 (valid input reflects) + Inv 21 (idempotency). |

## Payload Builder (`buildRscPayload`)

The wire-format helper publishes a canonical Flight payload from `state.context.rsc` + `state.context.rscAction` with an optional Server Component override. The function is pure (no router, no claim) — all invariants are reachable from hand-built `State` objects.

| #   | Invariant                                                  | Description                                                                                                                                                                                  |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 22  | Identity: default root tracks `state.context.rsc`           | `buildRscPayload(state).root === state.context.rsc` (reference identity, not deep copy). The function publishes the existing ReactNode without rewrapping. |
| 23  | Override winning: defined override replaces default         | For any defined `override`, `buildRscPayload(state, override).root === override`. A regression that fell back to default for non-null overrides would break Server Component composition (wrapping layout chrome). |
| 24  | Null preservation: explicit `null` override is preserved    | `buildRscPayload(state, null).root === null`. The function uses `=== undefined`, not `??`, so `null` (a valid ReactNode meaning "render nothing") survives the override path instead of collapsing to the default `state.context.rsc`. |
| 25  | Omit semantics: absent action → keys absent                 | When `state.context.rscAction === undefined`, the result object has NO `returnValue` and NO `formState` keys (verified via `in`-operator, not `=== undefined`). Required for `exactOptionalPropertyTypes: true` consumers. |
| 26  | Action passthrough by reference                             | When `state.context.rscAction.returnValue` (resp. `formState`) is defined, `payload.returnValue === action.returnValue` (reference identity). A deep-clone regression would inflate Flight payload size and break identity-based memoization. |
| 27  | Fixpoint under override-from-own-output                     | `buildRscPayload(state, buildRscPayload(state).root).root === state.context.rsc`. Applying the function to its own output must converge — protects against override-handling diverging from default-handling. |

## Server Action Plugin (`rscActionPluginFactory`)

The plugin publishes a Server Action result to `state.context.rscAction`. The per-start runtime guard at `actionFactory.ts:110-119` rejects Promise/thenable, array, and `null` values to surface the most common consumer mistake (wiring an `async getResult`) eagerly.

| #   | Invariant                                                  | Description                                                                                                                                                                                  |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 29  | Guard accepts any plain object                              | For any `result` with `typeof === "object" && !null && !Array.isArray && typeof .then !== "function"`, `claim.write(state, result)` succeeds — the value lands on `state.context.rscAction` unchanged. The guard is shape-blind beyond these four checks; extra/unknown fields ride through (forward-compat slot). |
| 30  | Promise/thenable detection rejects with documented prefix   | For any thenable `result` (real `Promise`, POJO with `.then === function`), `start()` rejects with a `TypeError` containing `"Promise/thenable"`. Catches the common `async getResult` mistake at the call site rather than inside an unrelated render later. |

> **Note on Inv 6.10 (audit):** `describeBadResult(value) === describeBadResult(value)` (detection determinism) is trivially true in JS — same call, same primitive comparisons, same string return. Not separately PBT-tested; documented here as Inv 29's pre-condition.

## Stale Registry (`staleRegistry`)

The CSR revalidation channel (Inv 20) uses a `WeakMap<Router, Set<string>>` to flag namespaces as stale until the next navigation consumes them. The registry is plugin-internal but its algebra is testable.

| #   | Invariant                                                  | Description                                                                                                                                                                                  |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 31  | `markStale` is Set-deduplicated (idempotent)                | `markStale(r, ns); markStale(r, ns)` leaves the registry in the same state as a single mark. A single `clearStale(r, ns)` restores `isStale(r, ns) === false` — no residual mark from the duplicated call. Guards against a regression that switched the internal `Set` to a multiset/counter. |
| 32  | `markStale` / `clearStale` is an inverse pair               | After `markStale(r, ns); clearStale(r, ns)`, `isStale(r, ns) === false`. The simplest inversion law — basis for the loader's "consume flag" cleanup path after a successful refresh.        |
| 33  | Per-router isolation (WeakMap key isolation)                | For any two distinct routers `r1 !== r2`, `markStale(r1, ns)` leaves `isStale(r2, ns) === false`. The flag does not leak across `cloneRouter()` boundaries or across independent router instances. Underwrites the per-request isolation contract that SSR depends on. |

## Test Files

| File                                          | Invariants | Category                                                                                                                                                |
| --------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/functional/rsc-loader.test.ts`         | full       | All categories — loader semantics, validation, teardown, error paths, ReactNode variants, sync/async, DI                                                |
| `tests/functional/buildRscPayload.test.ts`    | 22-27      | Pure function: root identity, override winning, null preservation, omit semantics, action passthrough, fixpoint                                          |
| `tests/functional/rsc-action.test.ts`         | runtime    | rscActionPluginFactory: capture, skip semantics, runtime guard against Promise/array/null, namespace teardown, three-plugin composition                  |
| `tests/property/rsc.properties.ts`            | 33         | Validation, loader invocation, loader arguments, data retrieval, prototype safety, teardown (+ Inv 13 PBT), isolation, factory invocation, **composition with ssr-data-plugin**, **per-namespace `invalidate` orthogonality**, **SSR mode (×4) + idempotency + closed-set membership (×2)**, **buildRscPayload (×6)**, **rscActionPluginFactory guard (×2)**, **staleRegistry algebra (×3)** |
| `tests/stress/*.stress.ts`                    | runtime    | Per-request isolation, error handling, concurrent loaders, slow loaders, full lifecycle churn                                                          |
