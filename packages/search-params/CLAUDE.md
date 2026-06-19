# search-params

Internal package for query string parsing and building with configurable strategies. Not published to npm -- consumed by `route-tree` via `createMatcher`.

## Exports

| Export               | Kind     | Description                                              |
| -------------------- | -------- | -------------------------------------------------------- |
| `parse(path, opts?)` | function | Parse query string into params object                    |
| `build(params, opts?)` | function | Build query string from params object                  |
| `omit(path, keys, opts?)` | function | Remove specified params from query string           |
| `keep(path, keys, opts?)` | function | Keep only specified params from query string         |
| `DEFAULT_QUERY_PARAMS` | const  | Default encoding options                                 |

### Types

| Type               | Description                                               |
| ------------------ | --------------------------------------------------------- |
| `Options`          | `{ arrayFormat?, booleanFormat?, nullFormat?, numberFormat? }` |
| `FinalOptions`     | All fields required (resolved from Options)               |
| `ArrayFormat`      | `"none"` / `"brackets"` / `"index"` / `"comma"`          |
| `BooleanFormat`    | `"none"` / `"auto"` / `"empty-true"`                     |
| `NullFormat`       | `"default"` / `"hidden"`                                 |
| `NumberFormat`     | `"none"` / `"auto"`                                      |
| `SearchParams`     | `Record<string, QueryParamValue \| undefined>`            |
| `QueryParamValue`  | `QueryParamPrimitive \| QueryParamPrimitive[]`            |
| `QueryParamPrimitive` | `string \| number \| boolean \| null`                  |
| `OmitResponse`     | `{ querystring, removedParams }`                          |
| `KeepResponse`     | `{ querystring, keptParams }`                             |
| `DecodeResult`     | `boolean \| string \| number \| null`                     |

## Module Structure

```
src/
├── searchParams.ts     -- parse, build, omit, keep
├── encode.ts           -- encode(key, value, options), makeOptions, DEFAULT_QUERY_PARAMS
├── decode.ts           -- decode(rawValue, strategies), decodeValue(raw)
├── utils.ts            -- getSearch(path) — extracts query part from path
├── strategies/
│   ├── array.ts        -- Array format encode/decode strategies
│   ├── boolean.ts      -- Boolean format strategies
│   ├── number.ts       -- Number format strategies
│   ├── null.ts         -- Null format strategies
│   └── index.ts        -- ResolvedStrategies, resolveStrategies()
├── types.ts            -- All type definitions
└── index.ts            -- Public API re-exports
```

## Gotchas

### No options = the same `auto` defaults for `parse` and `build` (#744)

Calling `parse()` or `build()` without options resolves to the cached `DEFAULT_OPTIONS` (`DEFAULT_QUERY_PARAMS` — all `auto`), so `parse(build(x)) === x` even with no options. The lookup is allocation-free (a cached singleton), so there is no string-only fast path anymore — the previous asymmetry (`build` used `auto`, `parse` used a `none`-like `parseSimple`) silently dropped types and was removed.

### Empty arrays produce empty string

`build({ items: [] })` returns `""` for all array formats including `comma` — the key is erased uniformly (INVARIANTS #9). Roundtripping empty arrays through `build` then `parse` loses the key.

### `empty-true` reserves the bare key for `true` — `null` is not representable

Under `booleanFormat: "empty-true"` the key-only form `?flag` means `true`. A `null` value with `nullFormat: "default"` encodes to the same bare key, so `build({ flag: null }, { booleanFormat: "empty-true" })` → `"flag"` → `parse` → `{ flag: true }`, **not** `null` — both collapse to one wire token and only `true` decodes back (INVARIANTS #18). Pair `empty-true` with `nullFormat: "hidden"`, or avoid null query values. The roundtrip property excludes this combo (asserted explicitly in `formats.properties.ts`) so the oracle stays an honest contract instead of mirroring the loss.

### Prototype-name keys are own properties

The parse accumulator detects repeated keys with `Object.hasOwn`, not `params[name] !== undefined` — so a query key shadowing an `Object.prototype` member (`valueOf`, `constructor`, `toString`, …) is a plain param, not the inherited function. `__proto__` is assigned via `Object.defineProperty` so it becomes a real own entry instead of mutating the prototype. Without this, `?constructor=x` parsed to `{ constructor: [<fn>, "x"] }`.

### `omit`/`keep` work on raw query string

These functions operate on the string level (slicing chunks by `&`) rather than parsing first. This avoids double-decoding and preserves original encoding.

### Comma array format splits before decoding

For `arrayFormat: "comma"`, the raw value is split on `,` before individual elements are decoded through strategies. This prevents commas inside encoded values from being treated as separators.

### `sliceParamName` scans for `=` or `[`

Parameter name extraction stops at the first `=` (value separator) or `[` (bracket notation). This avoids creating intermediate substrings.
