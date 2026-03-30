# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## Parse / Build

| #   | Invariant                         | Description                                                                                                                                                                                     |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Roundtrip (string values)         | `parse(build(params, opts), opts) === params` for string-only values. Verifies the core serialization cycle is lossless.                                                                        |
| 2   | Roundtrip with type normalization | `parse(build(params, opts), opts) ≈ normalizeForComparison(params, opts)` for mixed-type values. Numbers and booleans serialize as strings, so comparison uses type-normalized expected values. |
| 3   | Double-roundtrip stability        | `parse(build(parse(build(p, opts), opts), opts) , opts) ≡ parse(build(p, opts), opts)`. A second pass through the build/parse cycle produces no further changes.                                |
| 4   | Build determinism                 | Two calls to `build(params, opts)` with identical arguments always return the same string. The function has no hidden state.                                                                    |
| 5   | Boundary value acceptance         | `parse("")` returns `{}`, `parse("?")` returns `{}`, and `build({})` returns `""`. Empty inputs are handled without errors.                                                                     |
| 6   | No `?` prefix from build          | `build(params, opts)` never returns a string starting with `?`. Callers are responsible for prepending the separator when needed.                                                               |
| 7   | Percent-encoding roundtrip        | Values containing special characters (spaces, `&`, `=`, `?`, `#`, `+`, `/`) survive the `build → parse` cycle losslessly via `encodeURIComponent`/`decodeURIComponent`.                         |
| 8   | Undefined exclusion               | `build(params)` silently drops keys whose value is `undefined`, producing the same output as building without those keys.                                                                       |
| 9   | Empty array erasure               | `build({key: []})` produces an empty string for that key (non-comma formats), so `parse(build({key: []}))` does not contain `key`.                                                              |

## Omit / Keep

| #   | Invariant                  | Description                                                                                                                                                                                                                                 |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Partitioning               | Every key from `parse(qs)` ends up in exactly one of `removedParams` or the remaining `querystring` after `omit`. No key is lost or duplicated.                                                                                             |
| 2   | Omit idempotency           | `omit(omit(qs, keys).querystring, keys).querystring === omit(qs, keys).querystring`. Applying `omit` twice with the same keys changes nothing on the second pass.                                                                           |
| 3   | Omit identity              | `omit(qs, []).querystring === qs`. Omitting an empty key list leaves the query string unchanged.                                                                                                                                            |
| 4   | Keep identity              | `keep(qs, allKeys).querystring === qs`. Keeping all keys leaves the query string unchanged.                                                                                                                                                 |
| 5   | Omit complement            | No key from the omit list appears in the remaining query string after `omit`.                                                                                                                                                               |
| 6   | Keep complement            | No key absent from the keep list appears in `keptParams` after `keep`.                                                                                                                                                                      |
| 7   | Omit ? prefix preservation | If the input path starts with `?` and omit does not remove all parameters, the returned `querystring` also starts with `?`.                                                                                                                 |
| 8   | Keep empty list            | `keep(qs, [])` always returns `{keptParams: {}, querystring: ""}` regardless of the input query string.                                                                                                                                     |
| 9   | Omit/keep duality          | `{...parse(omit(qs, keys).querystring, opts), ...parse(keep(qs, keys).querystring, opts)} ≡ parse(qs, opts)`. Removing keys with `omit` and keeping the same keys with `keep` produces complementary subsets that reconstruct the original. |
| 10  | Keep no `?` prefix         | `keep(qs, keys).querystring` never starts with `?`, regardless of whether the input has a `?` prefix. This contrasts with `omit` which preserves the `?` prefix (invariant #7).                                                             |

## parseInto

| #   | Invariant              | Description                                                                                                                                              |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Equivalence with parse | `parseInto(qs, {})` produces the same result as `parse("?" + qs)`. `parseInto` is an allocation-free optimization of `parse`, not a different operation. |
| 2   | Non-destructive merge  | `parseInto(qs, target)` does not overwrite keys in the target object that are absent from the query string. Pre-existing values survive the call.        |
| 3   | Additive behavior      | After `parseInto(qs, target)`, the target contains all keys from both the original target and the parsed query string.                                   |

## Format Roundtrips

| #   | Invariant                            | Description                                                                                                                                                                                                                                              |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Array format: brackets/index         | `parse(build(params, {arrayFormat}), {arrayFormat}) === params` for `"brackets"` and `"index"` formats with string arrays.                                                                                                                               |
| 2   | Array format: none (multi-element)   | Multi-element string arrays roundtrip correctly with `arrayFormat: "none"` via repeated keys.                                                                                                                                                            |
| 3   | Boolean format: string               | `parse(build(params, {booleanFormat: "string"}), {booleanFormat: "string"}) === params`. Boolean types are preserved through the cycle.                                                                                                                  |
| 4   | Boolean format: empty-true           | `true` values roundtrip correctly with `booleanFormat: "empty-true"` (key-only encoding).                                                                                                                                                                |
| 5   | Null format: default                 | `parse(build(params, {nullFormat: "default"})) === params`. `null` is encoded as a key-only entry and parsed back as `null`.                                                                                                                             |
| 6   | Null format: hidden                  | With `nullFormat: "hidden"`, `build` produces an empty string and `parse` returns `{}`. Null values are fully suppressed.                                                                                                                                |
| 7   | Plus-as-space equivalence            | `parse(qs.replace(/%20/g, '+'))` produces the same result as `parse(qs)`. The decoder treats `+` as a space, equivalent to `%20`.                                                                                                                        |
| 8   | Array element type partition         | `build({key: [v]})` succeeds for `v: string \| number \| boolean` and throws `TypeError` for `v: null \| undefined \| object`. Array elements must be primitives (excluding null).                                                                       |
| 9   | None format: single-element collapse | `parse(build({a: [x]}, {arrayFormat: "none"}))` returns `{a: x}` (scalar), not `{a: [x]}` (array). Single-element arrays lose their array type through the none-format roundtrip because the parser cannot distinguish a single-value key from a scalar. |
| 10  | Number format: auto integers         | `parse(build(params, {numberFormat: "auto"}), {numberFormat: "auto"}) === params` for non-negative integer values. Numbers roundtrip through the encode/decode cycle losslessly.                                                                            |
| 11  | Number format: auto decimals         | `parse(build(params, {numberFormat: "auto"}), {numberFormat: "auto"}) === params` for decimal values (e.g., `12.5`). Decimal numbers survive the roundtrip.                                                                                                  |
| 12  | Number format: none preserves strings | `typeof parse(build({a: 42}, {numberFormat: "none"}), {numberFormat: "none"}).a === "string"`. With `numberFormat: "none"`, numbers become strings after the build/parse cycle.                                                                                |

## Test Files

| File                                      | Invariants | Category                   |
| ----------------------------------------- | ---------- | -------------------------- |
| `tests/property/parseBuild.properties.ts` | 1–9        | Core parse/build cycle     |
| `tests/property/omitKeep.properties.ts`   | 1–10       | Omit and keep operations   |
| `tests/property/parseInto.properties.ts`  | 1–3        | parseInto equivalence      |
| `tests/property/formats.properties.ts`    | 1–12       | Format-specific roundtrips |
