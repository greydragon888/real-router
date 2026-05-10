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

## `escapeForScript` (security-critical pure function — `numRuns: 1000`)

| #   | Invariant                                          | Description                                                                                                                                                                                                                                |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Roundtrip                                          | For any string `s`, `JSON.parse(escapeForScript(s)) === s`. The wire format must decode back to the original input losslessly.                                                                                                            |
| 2   | HTML safety: no `</script>` (case-insensitive)     | The output never contains a script-tag-terminator the raw HTML parser would honour, regardless of input casing. Direct defence against the canonical `"</script><script>alert(1)</script>"`-in-payload XSS.                              |
| 3   | HTML safety: no `<` (any tag opener)               | Stronger form of (2) — the result contains zero `<` chars. The raw HTML parser cannot start a new tag, comment, or CDATA section anywhere inside the literal.                                                                              |
| 4   | HTML safety: no U+2028 / U+2029                    | The legacy JS line-terminator codepoints must be encoded as ` ` / ` ` text inside the literal — never the raw chars, which pre-ES2019 parsers treat as line breaks inside string literals (and would terminate the literal). |
| 5   | Null fallback                                      | For non-string inputs JSON.stringify can't handle (`undefined`, `BigInt`), `escapeForScript` returns the literal `'null'` rather than throwing. Numbers / booleans pass through as their JSON literal form.                              |

## `defer()` (wire-format payload constructor)

| #   | Invariant                                                                  | Description                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Roundtrip / brand                                                          | `isDeferred(defer({ critical, deferred }))` is always `true`, and the returned `payload.critical === critical` (referential equality). Confirms the brand symbol installs and the critical reference passes through unmolested.    |
| 2   | Reserved-keys reject (`__proto__` / `constructor` / `prototype`)           | For any of the three reserved-name strings used as a deferred-map key, `defer()` throws with `/is reserved/`. Defence-in-depth against prototype-chain corruption when the client-side plugin reconstructs the deferred map.       |
| 3   | Freeze: payload + inner deferred map                                       | `Object.isFrozen(payload)` and `Object.isFrozen(payload.deferred)` both `true`. The wire-format value is immutable to consumers.                                                                                                       |
| 4   | Isolation: post-`defer` mutations to caller's map don't leak               | `defer()` works on a shallow clone of the deferred record — late additions to the user's map (e.g. `userMap.evil = badPromise`) never appear in `payload.deferred`. Locks the validation contract: only the snapshot at call time. |
| 5   | `isDeferred` rejects non-`defer()` values                                  | For any value the user could plausibly pass (primitives, plain objects, arrays, nested dicts), `isDeferred(value)` returns `false`. Prevents accidental brand collision via `Symbol.for` on third-party code.                       |

## `markStale` / `isStale` / `clearStale` (stale-registry algebra)

| #   | Invariant                                                | Description                                                                                                                                                     |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Idempotency: markStale × N ≡ markStale × 1               | For any namespace `ns` and any `N ≥ 1`, calling `markStale(router, ns)` N times leaves the flag set; `clearStale(router, ns)` once clears it.                |
| 2   | Round trip: mark → peek=true → clear → peek=false        | The three operations form a clean lifecycle: initial state is unset, mark sets, peek observes without mutation, clear unsets.                               |
| 3   | Idempotency of clearStale: N≥1 clears ≡ 1 clear          | Multiple `clearStale` calls between marks never resurrect the flag.                                                                                            |
| 4   | Per-router isolation                                     | `markStale(routerA, ns)` does not affect `isStale(routerB, ns)` for any pair of routers — comes free from the `WeakMap<Router, Set<string>>` key identity. |
| 5   | Per-namespace isolation                                  | `markStale(router, A)` does not affect `isStale(router, B)` when `A !== B` — the per-router Set is keyed by namespace string.                              |

## `getSsrDataMode` (pure read-side guard)

| #   | Invariant                                                | Description                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Transparency for allowed modes                           | For any `m ∈ {"full", "data-only", "client-only"}`, `getSsrDataMode({context: {ssrDataMode: m}}) === m`. Confirms the read mirrors what the plugin's `start` interceptor / `subscribeLeave` handler writes.                          |
| 2   | Foreign-value collapse to `"full"`                       | For any value outside `ALL_SSR_MODES` — `undefined`, `null`, `0`, `""`, `false`, arbitrary strings, integers, booleans, objects — `getSsrDataMode(state)` returns `"full"`. Defends downstream `mode === "full"` branches against TS-cast bypass. |

## `invalidate` per-router isolation

| #   | Invariant                                                                        | Description                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `invalidate(childA, "data")` never triggers childB's loader on the next nav      | The stale registry is `WeakMap<Router, Set<string>>` — per-router isolation comes free from the WeakMap key identity. Two clones from the same base router prove the invariant end-to-end through `subscribeLeave`. |

## Test Files

| File                                         | Invariants | Category                                                                            |
| -------------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `tests/functional/data-loader.test.ts`       | 3          | getDependency integration, no caching                                                                                     |
| `tests/property/ssr-data.properties.ts`      | 35         | Validation, loader invocation, loader arguments, data retrieval, prototype safety, teardown, isolation, factory invocation, SSR mode (×4), `escapeForScript` (×5), `defer()` (×5), **stale registry (×5)**, **getSsrDataMode (×2)**, **invalidate cloneRouter isolation (×1)** |
