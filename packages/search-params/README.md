# search-params

> Query string parsing and building with configurable format strategies.

**Internal package** — consumed by `route-tree`. Not published to npm.

## Purpose

Fast, configurable query string operations. Injected into `path-matcher` via `route-tree` for handling query parameters in route matching and path building.

## Consumer

- `route-tree` — passes format config into `createMatcher()` as DI

## Public API

| Function | Description |
|----------|-------------|
| `parse(queryString, options?)` | Parse query string to object |
| `parseInto(queryString, target)` | Parse directly into existing object (avoids allocation) |
| `build(params, options?)` | Build query string from object |
| `omit(path, paramsToOmit, options?)` | Remove specified parameters |
| `keep(path, paramsToKeep, options?)` | Keep only specified parameters |

```typescript
parse("page=1&sort=name");
// → { page: "1", sort: "name" }

build({ page: 1, sort: "name" });
// → "page=1&sort=name"

omit("page=1&sort=name&limit=10", ["sort", "limit"]);
// → { querystring: "page=1", removedParams: { sort: "name", limit: "10" } }
```

## Format Options

### `arrayFormat`

| Format | Encoded | Decoded |
|--------|---------|---------|
| `"none"` (default) | `a=1&a=2` | `{ a: ["1", "2"] }` |
| `"brackets"` | `a[]=1&a[]=2` | `{ a: ["1", "2"] }` |
| `"index"` | `a[0]=1&a[1]=2` | `{ a: ["1", "2"] }` |
| `"comma"` | `a=1,2` | `{ a: ["1", "2"] }` |

### `booleanFormat`

| Format | Encoded | Decoded |
|--------|---------|---------|
| `"auto"` (default) | `active=true` | `{ active: true }` |
| `"none"` | `active=true` | `{ active: "true" }` |
| `"empty-true"` | `active` | `{ active: true }` |

### `nullFormat`

| Format | Encoded |
|--------|---------|
| `"default"` | `key` (key only) |
| `"hidden"` | omitted |

### `numberFormat`

| Format | Decoded |
|--------|---------|
| `"auto"` (default) | `{ page: 1 }` (number) |
| `"none"` | `{ page: "1" }` (string) |

Detects integers and decimals matching `/^\d+(\.\d+)?$/`. No encoding change needed — numbers are encoded identically regardless of format.

**Note:** Negative numbers (e.g., `-1`, `-42`) are NOT automatically coerced from strings. This is by design — URL query params like `?offset=-10` remain as the string `"-10"`. Use explicit parsing in your application if negative number support is needed.

```typescript
parse("page=1&price=12.5&name=abc", { numberFormat: "auto" });
// → { page: 1, price: 12.5, name: "abc" }
```

## Value Semantics

| Input                      | `build(...)` output                    | Notes                                  |
| -------------------------- | -------------------------------------- | -------------------------------------- |
| `undefined`                | stripped                               | Key absent from URL                    |
| `null`                     | `?key` (key-only)                      | Via `nullFormat: "default"`            |
| `""` (empty string)        | `?key=` (explicit empty)               | Distinct from `null` — roundtrip with `parse("?key=") → { key: "" }` |
| `"value"`                  | `?key=value` (URI-encoded)             |                                        |
| `0`, `false`               | `?key=0`, `?key=false`                 | Falsy-but-defined preserved            |

| URL fragment               | `parse(...)` with default options  |
| -------------------------- | ---------------------------------- |
| `?flag`                    | `{ flag: null }` (key-only → `null`) |
| `?flag=`                   | `{ flag: "" }` (explicit empty value) |
| `?flag=x`                  | `{ flag: "x" }`                    |

**Key distinction:** `?flag` and `?flag=` are NOT equivalent. `null` (absent value) and `""` (present-but-empty) are distinct states. `undefined` is a third state — never emitted and never parsed (always absent key).

## Interaction with `@real-router/core`

`@real-router/core` normalizes `undefined` at its own boundary via `normalizeParams` (see [core README — Params Contract](../core/README.md#params-contract)). The `search-params.build()` strip of `undefined` acts as defense-in-depth at the string-serialization layer — both packages protect their own contract independently.

Use `booleanFormat: "empty-true"` together with [@real-router/search-schema-plugin](../search-schema-plugin/README.md) when schema declares `z.boolean()` — the plugin sees already-decoded `boolean` values, not strings.

## Key Design Decisions

- **Single-pass parsing** — no intermediate arrays
- **`parseInto` direct mutation** — avoids object allocation on hot path
- **Set-based filtering** — O(1) lookup for omit/keep operations
- **Zero intermediate allocations in omit/keep** — inline loop with string concatenation instead of array accumulation
- **Loop-based array encoding** — replaces `.map().join()` to avoid intermediate arrays
- **`codePointAt` scan in number detection** — avoids regex engine overhead

## Dependencies

None (zero dependencies).

## License

[MIT](../../LICENSE)
