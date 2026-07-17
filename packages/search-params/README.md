# search-params

[![Mutation Score](https://img.shields.io/endpoint?style=flat-square&url=https%3A%2F%2Fbadge-api.stryker-mutator.io%2Fgithub.com%2Fgreydragon888%2Freal-router%2Fmaster%3Fmodule%3Dsearch-params)](https://dashboard.stryker-mutator.io/reports/github.com/greydragon888/real-router/master?module=search-params)

> Query string parsing and building with configurable format strategies.

**Internal package** — consumed by `route-tree`. Not published to npm.

## Purpose

Fast, configurable query string operations. Injected into `path-matcher` via `route-tree` for handling query parameters in route matching and path building.

## Consumer

- `route-tree` — passes format config into `createMatcher()` as DI

## Public API

| Function | Description |
|----------|-------------|
| `parseQuery(queryString, options?)` | Parse query string to object |
| `build(params, options?)` | Build query string from object |
| `omit(path, paramsToOmit, options?)` | Remove specified parameters |
| `keep(path, paramsToKeep, options?)` | Keep only specified parameters |

```typescript
parseQuery("page=1&sort=name");
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
| `"empty-true"` | `active` (true), `active=false` (false) | `{ active: true }` / `{ active: false }` |

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

Detects canonical decimal numbers matching `/^-?(0|[1-9]\d*)(\.\d+)?$/` — including
negatives (`?offset=-10` → `-10`). No encoding change needed — numbers are encoded
identically regardless of format, so a value keeps the same type whether it arrives
from a URL or from a programmatic `navigate({ offset: -10 })`.

**Note:** Leading-zero values (`"007"`), exponent notation (`"1e3"`), and unsafe
integers (`"9007199254740992"`) are deliberately kept as strings to preserve their
exact text — they would otherwise change or lose precision through `Number()`.

```typescript
parseQuery("page=1&price=12.5&offset=-10&name=abc", { numberFormat: "auto" });
// → { page: 1, price: 12.5, offset: -10, name: "abc" }
```

## Value Semantics

| Input                      | `build(...)` output                    | Notes                                  |
| -------------------------- | -------------------------------------- | -------------------------------------- |
| `undefined`                | stripped                               | Key absent from URL                    |
| `null`                     | `?key` (key-only)                      | Via `nullFormat: "default"`            |
| `""` (empty string)        | `?key=` (explicit empty)               | Distinct from `null` — roundtrip with `parseQuery("?key=") → { key: "" }` |
| `"value"`                  | `?key=value` (URI-encoded)             |                                        |
| `0`, `false`               | `?key=0`, `?key=false`                 | Falsy-but-defined preserved            |

| URL fragment               | `parseQuery(...)` with default options  |
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
- **Set-based filtering** — O(1) lookup for omit/keep operations
- **Zero intermediate allocations in omit/keep** — inline loop with string concatenation instead of array accumulation
- **Loop-based array encoding** — replaces `.map().join()` to avoid intermediate arrays
- **`codePointAt` scan in number detection** — avoids regex engine overhead

## Dependencies

None (zero dependencies).

## License

[MIT](../../LICENSE)
