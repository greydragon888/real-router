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
| `"none"` (default) | `active=true` | `{ active: "true" }` |
| `"string"` | `active=true` | `{ active: true }` |
| `"empty-true"` | `active` | `{ active: true }` |

### `nullFormat`

| Format | Encoded |
|--------|---------|
| `"default"` | `key` (key only) |
| `"hidden"` | omitted |

## Key Design Decisions

- **Single-pass parsing** — no intermediate arrays
- **`parseInto` direct mutation** — avoids object allocation on hot path
- **Set-based filtering** — O(1) lookup for omit/keep operations

## Dependencies

None (zero dependencies).

## License

[MIT](../../LICENSE)
