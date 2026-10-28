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

## pickKeys

| #   | Invariant              | Description                                                                                                |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | Selection guarantee    | The result holds exactly the own keys of `params` that are in `keys`, each with the same value.            |
| 2   | Complement of omitKeys | `{ ...omitKeys(params, keys), ...pickKeys(params, keys) }` has exactly the own keys and values of `params`. |

## Validation Pipeline (forwardState interceptor)

| #   | Invariant                                | Description                                                                                                                                                                                              |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Valid params pass-through                | With a subset schema (simulating Zod strip mode), validated keys are preserved with correct values AND extra keys pass through in non-strict mode. Tests with non-echo schema to avoid tautology.        |
| 2   | Invalid key stripping                    | When the schema rejects a key for good — its value is `null`, which is never tried as text — the key is absent from result AND each key alongside it carries the schema's output for the repaired query — or its value as the repair built it when that query fails too.  |
| 3   | defaultSearch recovery                   | When the schema rejects keys for good and the route has `defaultSearch`, each rejected key takes its default AND each key of the repaired query carries the schema's output — or its value as the repair built it when that query fails too. A default for a key that was not rejected is merged as given. |
| 4   | Strict mode output isolation             | With `strict: true`, on valid params and on a repaired query the schema accepts, result params equal the schema's output exactly. No keys from the original params leak through.                        |
| 5   | Non-strict mode: override + preservation | With `strict: false`, schema-transformed values (uppercased) override originals for known keys, while extra keys pass through unchanged. Tests with transforming schema to prove override, not identity. |
| 6   | Async rejection                          | If `~standard.validate()` returns a Promise, TypeError is thrown. The plugin never awaits.                                                                                                               |

## Channel Isolation

| #   | Invariant                                   | Description                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The schema is handed the QUERY channel only | For every call shape (`navigate(name, bag)` single-bag or `navigate(name, params, search)`) and either `strict` setting, no PATH slot of the route — its own or an ancestor's — is passed to the schema, and every query value the caller supplied in EITHER channel is. The committed `state.params` still carries each slot's value verbatim, so the URL builds (#1564). |

## Decoded Text

| #   | Invariant                    | Description                                                                                                                                                                                                                                                                      |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A text schema ignores format | A schema that accepts only text, each value by an arbitrary predicate over it, settles a URL to the same `search` and `path` under the default formats as under `numberFormat` / `booleanFormat: "none"` — for a key's value and for an array element. A control cell shows the two formats decode `?a=17` apart. The property counts the runs where a decoded value — a number, a boolean, a key's value, an array element, each counted apart — was handed to the schema and its key kept, the case the text decides, and requires each count to be above zero. |
| 2   | The issues are the schema's own | For a text schema with a rule that judges the whole query and may name a key or the query itself, `onError` is handed either the decoded query or the last query the schema was handed, and its issues are exactly what the schema answers on that query. The property counts the calls that got the only query, the decoded one after text runs, the last text run's, and a run of its own with a value back as decoded, and the calls after text runs whose issues hold the rule's; it requires each count to be above zero. |

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
| `tests/property/helpers.properties.ts`    | 10         | getInvalidKeys, omitKeys, pickKeys             |
| `tests/property/validation.properties.ts` | 6          | Factory Options Validation                     |
| `tests/property/pipeline.properties.ts`   | 9          | Validation Pipeline (forwardState interceptor), Channel Isolation, Decoded Text |
