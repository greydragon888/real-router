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
| 6   | Deterministic                                      | For any string `s`, two calls to `escapeForScript(s)` return strictly equal strings. Referential transparency — required for cache layers and idempotent SSR replay.                                                                       |
| 7   | Non-shrinking length                               | For any string `s`, `escapeForScript(s).length >= s.length`. Cheap canary that no transformation pass silently drops chars (catches a regression that removes U+2028 without escaping it).                                                |
| 8   | Injective                                          | For any pair `(a, b)`, `escapeForScript(a) === escapeForScript(b)` ⇒ `a === b`. Implied by roundtrip but pinned explicitly so a future compaction pass that normalises whitespace and silently collides deferred-map keys fails fast.    |

## `defer()` (wire-format payload constructor)

| #   | Invariant                                                                  | Description                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Roundtrip / brand                                                          | `isDeferred(defer({ critical, deferred }))` is always `true`, and the returned `payload.critical === critical` (referential equality). Confirms the brand symbol installs and the critical reference passes through unmolested.    |
| 2   | Reserved-keys reject (`__proto__` / `constructor` / `prototype`)           | For any of the three reserved-name strings used as a deferred-map key, `defer()` throws with `/is reserved/`. Defence-in-depth against prototype-chain corruption when the client-side plugin reconstructs the deferred map.       |
| 3   | Freeze: payload + inner deferred map                                       | `Object.isFrozen(payload)` and `Object.isFrozen(payload.deferred)` both `true`. The wire-format value is immutable to consumers.                                                                                                       |
| 4   | Isolation: post-`defer` mutations to caller's map don't leak               | `defer()` works on a shallow clone of the deferred record — late additions to the user's map (e.g. `userMap.evil = badPromise`) never appear in `payload.deferred`. Locks the validation contract: only the snapshot at call time. |
| 5   | `isDeferred` rejects non-`defer()` values                                  | For any value the user could plausibly pass (primitives, plain objects, arrays, nested dicts), `isDeferred(value)` returns `false`. Prevents accidental brand collision via `Symbol.for` on third-party code.                       |
| 6   | `isDeferred` rejects inherited brand                                       | `isDeferred(Object.create({ [DEFER_BRAND]: true })) === false`. The brand check uses `Object.hasOwn` so a prototype-chain bypass — branding via inheritance — cannot smuggle an object past `processLoaderResult`'s slow path.   |
| 7   | `isDeferred` brand-only-plain contract                                     | `isDeferred({ [DEFER_BRAND]: true }) === true`. The guard is a brand check, not a structural check. Pinned to lock the current contract — any future refactor that requires `critical`/`deferred` fields to count must update this. |
| 8   | Promise identity preserved for every own key                               | For every `k` in the deferred input map, `payload.deferred[k] === input.deferred[k]`. The settle pipeline depends on observing the same Promise instance `.catch()` was attached to in the validator loop — a deep-clone regression breaks this without breaking primitive-payload roundtrip tests. |
| 9   | Key-order preserved                                                        | `Object.keys(payload.deferred)` strictly equals `Object.keys(input.deferred)`. Locks the contract that `state.context.ssrDataDeferredKeys` (declared order) matches the order consumers iterate via `useDeferred()`.                                                                                |

## `withTimeout` (race semantics — `numRuns: 50`)

| #   | Invariant                                                | Description                                                                                                                                                                              |
| --- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Fast-path returns loader value                            | For any T (incl. NaN, objects, arrays), when the loader resolves before the deadline, `withTimeout(route, ms, () => Promise.resolve(v))` resolves to a value structurally equal to `v`. |
| 2   | Deadline-path rejects with `LoaderTimeout(route, ms)`     | When the loader never settles, the rejection is a `LoaderTimeout` carrying the supplied `route` + `ms` (so HTTP middleware can map to 504 with route context).                          |
| 3   | Pre-aborted upstream short-circuit                        | When `upstreamSignal` is already aborted at call time, the loader is NEVER invoked, regardless of route name / timeout — the rejection mirrors `upstreamSignal.reason`.                  |

## `validateLoaders` (factory-time structural gate — `numRuns: 50`)

| #   | Invariant                                                | Description                                                                                                                                                                              |
| --- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Accepts empty `{}`                                        | `ssrDataPluginFactory({})` never throws — no routes registered is a valid configuration.                                                                                                |
| 2   | Accepts maps of valid short-form factories                | For any record of short-form factories `(r, getDep) => () => ...`, validation passes regardless of key set.                                                                              |
| 3   | Accepts any `{ ssr, loader }` with allowed mode string    | For each `m ∈ {"full", "data-only", "client-only"}`, validation of `{ home: { ssr: m, loader } }` passes.                                                                                |
| 4   | Rejects unknown top-level keys in object-form entries     | For any string `k ∉ {"ssr", "loader"}`, `{ home: { [k]: 1 } }` throws `TypeError /unexpected key/`.                                                                                       |
| 5   | Rejects string-form `ssr` outside `ALL_SSR_MODES`         | For any string `s ∉ ALL_SSR_MODES`, `{ home: { ssr: s } }` throws `TypeError /is not allowed/`.                                                                                          |
| 6   | Idempotency                                               | Calling the factory N times with the same loader map behaves identically — no factory-time state accumulates across calls (guards against a future cache that could relax validation).   |

## `formatSettleScript` + `getDeferBootstrapScript` (composition HTML safety — `numRuns: 500`)

| #   | Invariant                                                | Description                                                                                                                                                                              |
| --- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `formatSettleScript` body never contains `</script`       | For any (key, value, isError) input triple, the script body never contains a script-tag terminator. Pins the composition point — escapeForScript is the encoder, formatSettleScript is the assembler. |
| 2   | `formatSettleScript` output never contains raw U+2028/2029 | Same guarantee as `escapeForScript` invariant 4, but at the composition layer.                                                                                                          |
| 3   | `getDeferBootstrapScript` is deterministic                | The bootstrap is a const string — two calls return strictly equal output. Canary against accidental environment-coupling (timestamps, counters).                                         |
| 4   | `getDeferBootstrapScript` is HTML-safe                    | The bootstrap body contains no `</script` and no raw U+2028/U+2029.                                                                                                                     |
| 5   | `formatSettleScript` routes by `isError`                  | For `isError === true`, the output contains `__rrDeferError__(` and NOT `__rrDefer__(`; for `isError === false`, the reverse. Pinned because a flipped branch silently turns errors into successful resolutions on the client.                                                                                |

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
| 3   | Totality                                                 | For ANY input (incl. `BigInt`, `Symbol`, arrays, functions, nested objects), `getSsrDataMode` terminates and returns a value in `ALL_SSR_MODES`. Necessary precondition for the foreign-collapse property — if the function diverged or threw on some input class, the collapse property could not even run. |
| 4   | Idempotency                                              | Two calls to `getSsrDataMode(state)` on the same state return strictly equal modes. Pinned because `state.context` is mutable in principle — a future refactor that adds a "mode resolution cache" must not couple the cache to call ordering. |

## `invalidate` per-router isolation

| #   | Invariant                                                                        | Description                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `invalidate(childA, "data")` never triggers childB's loader on the next nav      | The stale registry is `WeakMap<Router, Set<string>>` — per-router isolation comes free from the WeakMap key identity. Two clones from the same base router prove the invariant end-to-end through `subscribeLeave`. |

## Test Files

| File                                         | Invariants | Category                                                                            |
| -------------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `tests/functional/data-loader.test.ts`       | 3          | getDependency integration, no caching                                                                                     |
| `tests/property/ssr-data.properties.ts`      | 58         | Validation, loader invocation, loader arguments, data retrieval, prototype safety, teardown, isolation, factory invocation, SSR mode (×4), `escapeForScript` (×8), `defer()` / `isDeferred` (×9), stale registry (×5), `getSsrDataMode` (×4), `invalidate` cloneRouter isolation (×1), `withTimeout` (×3), `validateLoaders` (×6), `formatSettleScript`/`getDeferBootstrapScript` (×5) |
