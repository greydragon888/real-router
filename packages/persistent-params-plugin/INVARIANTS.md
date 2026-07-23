# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## Persistence

| #   | Invariant              | Description                                                                                                                                                     |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Single-hop persistence | A param set on route A appears in the state of route B without being explicitly passed. The plugin injects it automatically via the `forwardState` interceptor. |
| 2   | Multi-hop persistence  | A param survives two consecutive cross-route navigations. The value stored after the first transition is re-injected on the second.                             |

## Override

| #   | Invariant                             | Description                                                                                                                    |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Explicit value wins                   | When a navigation explicitly passes a value for a tracked param, that value takes precedence over the stored persistent value. |
| 2   | Override becomes new persistent value | After an explicit override, the new value becomes the stored value and is injected into all subsequent navigations.            |

## No-Clobber

| #   | Invariant                             | Description                                                                                                                                                                                             |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Route path params are not overwritten | The `id` param (or any param explicitly passed to the destination route) always equals exactly what the caller provided. The plugin never replaces explicitly-passed values with stale persistent ones. |
| 2   | No-clobber holds across multiple hops | The explicitly-passed `id` remains correct after a chain of navigations, regardless of how many persistent params are being injected alongside it.                                                      |

## Scope

| #   | Invariant                                            | Description                                                                                                                                                  |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Unconfigured params are not injected                 | A param that was not listed in the plugin config is never added to subsequent navigation states, even if it was passed during a previous navigation.         |
| 2   | Configured and unconfigured params coexist correctly | When both a configured and an unconfigured param are passed together, the configured one persists and the unconfigured one is absent on the next navigation. |

## Idempotency

| #   | Invariant                                           | Description                                                                                                                                                                      |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | buildPath is idempotent with respect to persistence | `buildPath` called with an explicit persistent param produces the same path as `buildPath` called without it after the param has been stored. The plugin does not double-inject. |
| 2   | Param appears exactly once in state                 | After multiple navigations, a persistent param key appears exactly once in the committed state's `search` params (`state.search` — the channel persisted query params occupy post-RFC-4 M2 / #1548). The merge logic never duplicates keys.                                    |

## Removal

| #   | Invariant                                           | Description                                                                                                                                                                                               |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Param set to undefined is absent on next navigation | Passing `undefined` for a tracked param removes it from `#paramNamesSet` and `#persistentParams` **once the removal navigation commits** (in `onTransitionSuccess`). Subsequent navigations do not inject the removed param. |
| 2   | Removal is permanent                                | After removal via `undefined`, re-passing the same param name in a later navigation does NOT restore persistence. The key was deleted from `#paramNamesSet`, so `onTransitionSuccess` never re-tracks it. |
| 3   | Removal on a rejected/cancelled transition rolls back | The removal is committed only in `onTransitionSuccess`, so a `navigate({ key: undefined })` rejected by a guard or superseded by a concurrent navigate leaves the param persisted — the never-committed transition does not drop it (#803). |

## Default Values

| #   | Invariant                                              | Description                                                                                                                                                                                   |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Object config injects defaults before any explicit set | `persistentParamsPluginFactory({ lang: "en" })` injects `"en"` on the very first navigation without the caller passing `lang`. Array config sets `undefined`; object config sets real values. |
| 2   | Explicit value overrides default and persists          | When a navigation explicitly passes a value for a param that has a default, the explicit value replaces the default and becomes the new persistent value.                                     |

## Multi-Param

| #   | Invariant                                      | Description                                                                                                                              |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Two persistent params both survive navigation  | When two params are configured and set together, both appear in the state after navigating to a different route without re-passing them. |
| 2   | Overriding one param does not affect the other | Overriding one persistent param while leaving the other untouched preserves the untouched param's value across subsequent navigations.   |

## Merge Semantics

| #   | Invariant                    | Description                                                                                                                    |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Identity                     | `mergeParams(persistent, {})` returns persistent with undefined values excluded. Empty current does not alter defined entries. |
| 2   | Current overrides persistent | For any key present in both objects, the current value appears in the result, replacing the persistent value.                  |
| 3   | Undefined removes            | Setting a key to `undefined` in current removes it from the result, even if persistent defines it.                             |
| 4   | No mutation                  | Neither persistent nor current is mutated by the merge operation. Both objects remain unchanged after the call.                |

## Own-Property Extraction

| #   | Invariant             | Description                                                                                                                              |
| --- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Idempotency           | `extractOwnParams(extractOwnParams(x))` deep-equals `extractOwnParams(x)`. Extracting twice produces the same result as extracting once. |
| 2   | Own-property fidelity | Result contains exactly the own enumerable properties of the input with identical values. No keys are added or removed.                  |

## Validation

| #   | Invariant                     | Description                                                                                                      |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Valid keys accepted           | Any non-empty string without `[\s#%&/=?\\]` passes `validateParamKey` without throwing.                          |
| 2   | Invalid keys rejected         | Any string containing at least one character from `[\s#%&/=?\\]` causes `validateParamKey` to throw `TypeError`. |
| 3   | Primitive values accepted     | `validateParamValue` does not throw for `string`, finite `number`, `boolean`, or `undefined`.                    |
| 4   | Non-primitive values rejected | `validateParamValue` throws `TypeError` for `null`, arrays, objects, `NaN`, and `±Infinity`.                     |

## State Context

| #   | Invariant                                              | Description                                                                                                                                                                                                       |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | state.context.persistentParams reflects stored snapshot | After every successful transition, `state.context.persistentParams` deep-equals the plugin's internal `#persistentParams` snapshot. It contains only the currently tracked persistent params, not route-specific params. |
| 2   | state.context.persistentParams is a subset of state.search (or state.params via makeState) | Every key in `state.context.persistentParams` also exists in `state.search` with the same value — the canonical channel for a committed query param post-RFC-4 M2 (#1548). For a state built via `makeState` (e.g. `start()`'s injected default, or a `navigateToState` commit) that hasn't been slot-shifted yet, the value instead rides in `state.params`. Either way, the context snapshot is always a subset of whichever channel actually carries the persisted keys.                                                 |

## Test Files

| File                                            | Invariants | Category                                                                                    |
| ----------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| `tests/property/persistentParams.properties.ts` | 17         | Persistence, Override, No-Clobber, Scope, Idempotency, Removal, Default Values, Multi-Param |
| `tests/property/paramUtils.properties.ts`       | 6          | Merge Semantics, Own-Property Extraction                                                    |
| `tests/property/validation.properties.ts`       | 4          | Validation                                                                                  |
