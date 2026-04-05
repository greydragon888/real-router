# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## getInvalidKeys

| #   | Invariant                         | Description                                                                                                                                               |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Exact equality with expected keys | Result Set equals exactly the set of `String(issue.path[0])` keys from all issues with non-empty path. No keys missing, no keys invented.                 |
| 2   | Path-less issues ignored          | Issues without `path` or with `path.length === 0` contribute no keys to the result. Only issues with a non-empty path produce output.                     |
| 3   | Object segment extraction         | When `path[0]` is `{ key: K }`, the extracted key equals `String(K)`. When `path[0]` is a bare `PropertyKey`, the extracted key equals `String(path[0])`. |
| 4   | Idempotency                       | Calling `getInvalidKeys` twice on the same issues produces the same Set. The function has no side effects.                                                |

## omitKeys

| #   | Invariant                   | Description                                                                                                               |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | Exclusion guarantee         | No key from the `keys` Set appears in the result object. `Object.keys(result)` ∩ `keys` = ∅.                              |
| 2   | Retention guarantee         | Every own key of `params` NOT in `keys` appears in the result with the same value. No data is lost for non-excluded keys. |
| 3   | No mutation                 | The input `params` object is not modified. A fresh object is always returned.                                             |
| 4   | Empty exclusion is identity | `omitKeys(params, new Set())` deep-equals `params` (same own keys and values).                                            |

## Validation Pipeline (forwardState interceptor)

| #   | Invariant                                | Description                                                                                                                                                                                              |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Valid params pass-through                | With a subset schema (simulating Zod strip mode), validated keys are preserved with correct values AND extra keys pass through in non-strict mode. Tests with non-echo schema to avoid tautology.        |
| 2   | Invalid key stripping                    | When schema returns `{ issues }`, invalid keys are absent from result AND valid params alongside them are preserved with correct values.                                                                 |
| 3   | DefaultParams recovery                   | When schema returns `{ issues }` and route has `defaultParams`, stripped keys are filled from defaults AND valid params alongside them are preserved.                                                    |
| 4   | Strict mode output isolation             | With `strict: true` and valid params, result params equal `validation.value` exactly. No keys from the original params leak through.                                                                     |
| 5   | Non-strict mode: override + preservation | With `strict: false`, schema-transformed values (uppercased) override originals for known keys, while extra keys pass through unchanged. Tests with transforming schema to prove override, not identity. |
| 6   | Async rejection                          | If `~standard.validate()` returns a Promise, TypeError is thrown. The plugin never awaits.                                                                                                               |

## Factory Options Validation

| #   | Invariant                | Description                                                                                                |
| --- | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 1   | Valid mode accepted      | `"development"` and `"production"` do not throw. `undefined` does not throw (defaults to `"development"`). |
| 2   | Invalid mode rejected    | Any string that is not `"development"` or `"production"` causes `TypeError`.                               |
| 3   | Valid strict accepted    | `true`, `false`, and `undefined` do not throw.                                                             |
| 4   | Invalid strict rejected  | Any non-boolean, non-undefined value causes `TypeError`.                                                   |
| 5   | Valid onError accepted   | A function or `undefined` does not throw.                                                                  |
| 6   | Invalid onError rejected | Any non-function, non-undefined value causes `TypeError`.                                                  |

## Test Files

| File                                      | Invariants | Category                                       |
| ----------------------------------------- | ---------- | ---------------------------------------------- |
| `tests/property/helpers.properties.ts`    | 8          | getInvalidKeys, omitKeys                       |
| `tests/property/validation.properties.ts` | 6          | Factory Options Validation                     |
| `tests/property/pipeline.properties.ts`   | 6          | Validation Pipeline (forwardState interceptor) |
