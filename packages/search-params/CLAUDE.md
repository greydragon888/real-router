# search-params

Internal package for query string parsing and building with configurable strategies. Not published to npm -- consumed by `route-tree` via `createMatcher`.

## Exports

| Export               | Kind     | Description                                              |
| -------------------- | -------- | -------------------------------------------------------- |
| `parse(path, opts?)` | function | Parse query string into params object (`getSearch` + `parseQuery`) |
| `parseQuery(search, opts?)` | function | Parse an ALREADY-extracted query string, **without** `getSearch` — the entry route-tree's matcher uses (#1292) |
| `build(params, opts?)` | function | Build query string from params object                  |
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
| `DecodeResult`     | `boolean \| string \| number \| null`                     |

## Module Structure

```
src/
├── searchParams.ts     -- parse, parseQuery, build
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

### `parse` splits at the first `?`; `parseQuery` does not (#1292)

`parse(path)` runs `getSearch(path)` first, discarding everything up to the first `?` — it accepts a full path OR a bare query. `parseQuery(search)` skips that step and parses its input verbatim (`parse` = `getSearch` + `parseQuery`). A consumer that has ALREADY split the URL at the first `?` — route-tree's matcher does, in `SegmentMatcher.#preparePath`, before the DI call — MUST use `parseQuery`: routing through `parse` would split a SECOND time at a `?` **inside** a query value (legal per RFC 3986), silently dropping the param (and unmatching the whole URL under `strictQueryParams`). Only route-tree's `createMatcher` consumes the query parser, and it uses `parseQuery`.

### Negative zero `-0` stays a string under `auto`

`numberFormat: "auto"` rejects negative zero: `"-0"` / `"-0.0"` decode to the **string** `"-0"`, not the number `-0` (#898). `-0` is a valid JS number but not round-trippable — `String(-0) === "0"` and `build(-0)` emits `"0"`, so coercing it would silently drop the sign and break `parse(build(x)) === x`. Same non-round-trippable class as leading-zero / unsafe-int / exponent (`number.ts` `Object.is(num, -0)` guard; INVARIANTS #16).

### Empty arrays produce empty string

`build({ items: [] })` returns `""` for all array formats including `comma` — the key is erased uniformly (INVARIANTS Parse/Build #9). Roundtripping empty arrays through `build` then `parse` loses the key.

### Null array elements round-trip via the bare-key form (#1155)

`parse` yields a `null` array element from a key-only chunk on a repeated/bracketed key (`parse("a&a=1")` → `{ a: [null, 1] }`, `parse("a[]", { arrayFormat: "brackets" })` → `{ a: [null] }`). `build` now encodes each null element to the SAME wire token a scalar null does — the bare key per format (`none` → `a`, `brackets` → `a[]`, `index` → `a[i]`) under `nullFormat: "default"`, dropped under `"hidden"`. `comma` has no per-element bare form, so a null element (reachable only via a bracketed chunk under a comma config — a wire/format mismatch) is dropped. This closes `range(parse) ⊆ dom(build)`, so `build(parse(qs))` never throws (INVARIANTS Format Roundtrips #9, Parse/Build #12). Only `undefined` / object array elements still throw. The `ArrayStrategy.encodeArray` signature therefore takes the resolved null strategy as a third argument (`encodeArray(name, values, nullStrategy)`); `comma`'s impl omits it (a 2-arg impl satisfies the 3-arg interface).

### Lone surrogate → U+FFFD, keeping `build` total (#1314)

`safeEncode` (`utils.ts`) wraps `encodeURIComponent` in try/catch: a lone (unpaired) surrogate — the only string it rejects (`URIError`) — is sanitized to U+FFFD by a lone-surrogate regex (a lib-agnostic manual `toWellFormed`; consumers compile this src under their own `tsconfig`, whose `lib` may predate es2024) and re-encoded, so `build({ a: "\uD800" })` → `"a=%EF%BF%BD"` instead of throwing. `parse` accepts a literal surrogate verbatim (its non-percent decode is identity), so without this `build(parse("a=\uD800"))` threw — the surrogate facet of the same `range(parse) ⊆ dom(build)` class as null array elements (#1155). Single-sourced for both encode sites (`encode.ts` scalar/key + `strategies/array.ts` element), so they cannot drift. It is **lossy**: the first round-trip mutates the (non-round-trippable) garbage to `�`, then stabilises (INVARIANTS Format Roundtrips #20). path-matcher applies the identical sanitize on path params (#1315).

### Empty query chunks are skipped in parse (#1156)

A `&&`, a leading `&`, or a trailing `&` is an empty chunk (zero-length span) — `parse` skips it instead of decoding it to a junk `{ "": null }` param: `parse("&a=1")` → `{ a: 1 }`, `parse("x=1&&&x=2")` → `{ x: [1, 2] }`. An intentional empty-key chunk carries an `=` (`parse("=1")` → `{ "": 1 }`), so its span is non-empty and is unaffected (INVARIANTS Parse/Build #13).

### `empty-true` reserves the bare key for `true` — `null` is not representable

Under `booleanFormat: "empty-true"` the key-only form `?flag` means `true`. A `null` value with `nullFormat: "default"` encodes to the same bare key, so `build({ flag: null }, { booleanFormat: "empty-true" })` → `"flag"` → `parse` → `{ flag: true }`, **not** `null` — both collapse to one wire token and only `true` decodes back (INVARIANTS #18). Pair `empty-true` with `nullFormat: "hidden"`, or avoid null query values. The roundtrip property excludes this combo (asserted explicitly in `formats.properties.ts`) so the oracle stays an honest contract instead of mirroring the loss.

### The empty-string key `""` is erased when its value encodes to a bare key

`build` drops any chunk that encodes to the empty string (`searchParams.ts` `if (encoded)` — the same filter that erases `nullFormat: "hidden"`). For the **empty-string key** `""`, a value that encodes to a **bare key** (no `=`) yields the token `""` → dropped: `build({ "": true }, { booleanFormat: "empty-true" })` and `build({ "": null }, { nullFormat: "default" })` both return `""`, and `parse` recovers `{}` — a silent `parse(build(x)) != x`. Every other value (`string` / `number` / `false`) encodes `=value` and round-trips, and a non-empty key's bare token (`name`) survives. Pathological (router query keys come from route definitions, never empty) but type-valid (`SearchParams = Record<string, …>`); a documented loss (INVARIANTS #19), asserted in `formats.properties.ts`. `arbSafeKey` was widened to `minLength: 0` so the suite exercises the empty key, with the two erasing combos excluded via the `erasesEmptyKey` helper (#1051).

### Prototype-name keys are own properties

The parse accumulator detects repeated keys with `Object.hasOwn`, not `params[name] !== undefined` — so a query key shadowing an `Object.prototype` member (`valueOf`, `constructor`, `toString`, …) is a plain param, not the inherited function. `__proto__` is assigned via `Object.defineProperty` so it becomes a real own entry instead of mutating the prototype. Without this, `?constructor=x` parsed to `{ constructor: [<fn>, "x"] }`.

### Comma array format splits before decoding

For `arrayFormat: "comma"`, the raw value is split on `,` before individual elements are decoded through strategies. This prevents commas inside encoded values from being treated as separators.

### `sliceParamName` scans for `=` or `[`

Parameter name extraction stops at the first `=` (value separator) or `[` (bracket notation). This avoids creating intermediate substrings.

## Testing

### Unit tests exercise the PUBLIC API (white-box guardrail)

`tests/functional/**` import ONLY from the package index (`import { parse, parseQuery, build } from "search-params"`), never `../../src/*`. The internals — `decode`/`decodeValue`, `encode`/`encodeValue`/`makeOptions`, `getSearch`/`safeEncode`, and every per-format `strategies/*` object — are all reachable through `parse`/`build` under the matching format option, so a unit test that reaches inside would kill a mutant without strengthening the public contract AND hide any publicly-unreachable (dead) code from the 100% coverage gate. A `no-restricted-imports` block in `eslint.config.mjs` enforces this; the allowlist holds ONE documented KEEP-narrow exception:

- **`makeOptions.singleton.test.ts`** — the allocation-free cached-singleton identity of `DEFAULT_OPTIONS` (a hot-path memory/perf invariant, the premise of `parse-scale.stress.ts`). The resolved default VALUES and the partial-override precedence ARE public (asserted in `search-params.test.ts` "option resolution"); only the object-identity — never handed back through `parse`/`build`, so publicly indistinguishable — is pinned directly. Twin of path-matcher's `createSegmentNode.test.ts`.

`tests/property/**` and `tests/stress/**` are NOT constrained — they legitimately drive `build`/`parse` over generated/scaled inputs (round-trip invariants, leak guards). A pure internal function that cannot be reached through the public surface belongs in `tests/property/` (exempt); a genuinely unreachable branch gets a documented `ignores:` entry, not a src import in a unit test.
