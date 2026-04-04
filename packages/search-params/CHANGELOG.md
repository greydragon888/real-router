# search-params

## 0.2.2

### Minor Changes

- Add comma array format decode — parse roundtrip now works (#396)

`parse("items=a,b,c", { arrayFormat: "comma" })` now returns `{ items: ["a", "b", "c"] }` instead of `{ items: "a,b,c" }`.

- Added `decodeValue` method to `ArrayStrategy` interface
- Comma strategy splits on unencoded commas; encoded `%2C` stays as literal
- Each element passes through number/boolean strategies
- Single values without commas remain scalars (no array wrapping)
- Empty array encode changed from `"key="` to `""` (consistent with other formats)

## 0.2.1

### Patch Changes

- Fix `numberFormat: "auto"` lossy roundtrip for leading zeros and unsafe integers

`autoNumberStrategy.decode("00")` no longer returns `0` — leading zeros are preserved as strings. Similarly, integers beyond `Number.MAX_SAFE_INTEGER` stay as strings to prevent precision loss.

- Leading zeros (`"00"`, `"007"`, `"01"`) → `null` (remain strings)
- Unsafe integers (`"99999999999999999"`) → `null` (remain strings)
- `"0"` and `"0.5"` still parse as numbers (canonical forms)

### Bug fix

- Fix `defaultParseQueryString` missing URI decoding in `path-matcher` — `decodeURIComponent` now applied to both keys and values

## 0.2.0

### Minor Changes

- Add `numberFormat` option (`"none"` | `"auto"`) — auto-detects numeric query parameter values and parses them as numbers
- Add `NumberFormat` type export
- Extend `DecodeResult` type to include `number`

### Performance

- Replace `extractParamName` object allocation with inline `bracketPos` index scan — eliminates `{ name, hasBrackets }` allocation per parameter (**-77% heap** on stress parse 1000 params)
- Replace `split("+").join(" ")` with `replaceAll("+", " ")` in `decodeValue` — eliminates intermediate array (**-24% time, -29% heap** on `+` encoded values)
- Replace regex with `codePointAt` scan in `autoNumberStrategy` — eliminates regex engine overhead (**-9% time, -39% heap** vs regex)
- Replace `forEachParam` closure + `extractChunkName` (2-3 slices) with inline loop + `sliceParamName` (1 slice) in `omit`/`keep` — eliminates closure allocation and intermediate string slices (**-30% time, -50% heap** on keep/omit operations)
- Replace `kept[]`/`removed[]` array accumulation with direct string concatenation via `appendChunk` helper — eliminates array allocations in `omit`/`keep`
- Replace `.map().join()` with loop concatenation in all array strategies — eliminates intermediate array allocation (**-25% time, -27% heap** on array encoding)

## 0.1.1

### Patch Changes

- Rewrite README — internal package style with Purpose, Consumers, Format Options tables, Key Design Decisions (#320)

## 0.1.0

### Minor Changes

- Initial public release with full routing functionality
