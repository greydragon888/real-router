# search-params

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

> Query string parsing and building with configurable strategies.

**⚠️ Internal Use Only:** This package is designed for use within the Real-Router monorepo. External users should use `@real-router/core` package directly.

## Overview

`search-params` provides fast, configurable query string operations:

- **Parsing** — convert query strings to objects
- **Building** — convert objects to query strings
- **Filtering** — keep or omit specific parameters
- **Format strategies** — configurable array, boolean, and null handling

## API

### `parse(path, options?)`

Parse a query string into an object.

```typescript
import { parse } from "search-params";

parse("page=1&sort=name");
// → { page: "1", sort: "name" }

parse("?active=true&count=5");
// → { active: "true", count: "5" }

// With array format
parse("items[]=a&items[]=b", { arrayFormat: "brackets" });
// → { items: ["a", "b"] }

// With boolean format
parse("active=true&disabled=false", { booleanFormat: "string" });
// → { active: true, disabled: false }
```

---

### `parseInto(queryString, target)`

Parse query string directly into an existing object (avoids allocation).

```typescript
import { parseInto } from "search-params";

const params = { existing: "value" };
parseInto("page=1&sort=name", params);
// params → { existing: "value", page: "1", sort: "name" }
```

---

### `build(params, options?)`

Build a query string from an object.

```typescript
import { build } from "search-params";

build({ page: 1, sort: "name" });
// → "page=1&sort=name"

build({ active: true, count: null });
// → "active=true&count"

// With array format
build({ items: ["a", "b"] }, { arrayFormat: "brackets" });
// → "items[]=a&items[]=b"

// Skip undefined values
build({ page: 1, filter: undefined });
// → "page=1"
```

---

### `omit(path, paramsToOmit, options?)`

Remove specified parameters from a query string.

```typescript
import { omit } from "search-params";

omit("page=1&sort=name&limit=10", ["sort", "limit"]);
// → {
//     querystring: "page=1",
//     removedParams: { sort: "name", limit: "10" }
//   }

omit("?page=1&sort=name", ["sort"]);
// → { querystring: "?page=1", removedParams: { sort: "name" } }
```

---

### `keep(path, paramsToKeep, options?)`

Keep only specified parameters from a query string.

```typescript
import { keep } from "search-params";

keep("page=1&sort=name&limit=10", ["page"]);
// → {
//     querystring: "page=1",
//     keptParams: { page: "1" }
//   }

keep("page=1&sort=name&limit=10", ["page", "limit"]);
// → {
//     querystring: "page=1&limit=10",
//     keptParams: { page: "1", limit: "10" }
//   }
```

## Options

```typescript
interface Options {
  arrayFormat?: ArrayFormat;    // "none" | "brackets" | "index" | "comma"
  booleanFormat?: BooleanFormat; // "none" | "string" | "empty-true"
  nullFormat?: NullFormat;      // "default" | "hidden"
}
```

### `arrayFormat`

How to encode/decode array values.

| Format | Encoded | Decoded |
|--------|---------|---------|
| `"none"` (default) | `a=1&a=2` | `{ a: ["1", "2"] }` |
| `"brackets"` | `a[]=1&a[]=2` | `{ a: ["1", "2"] }` |
| `"index"` | `a[0]=1&a[1]=2` | `{ a: ["1", "2"] }` |
| `"comma"` | `a=1,2` | `{ a: ["1", "2"] }` |

---

### `booleanFormat`

How to encode/decode boolean values.

| Format | Encoded | Decoded |
|--------|---------|---------|
| `"none"` (default) | `active=true` | `{ active: "true" }` |
| `"string"` | `active=true` | `{ active: true }` |
| `"empty-true"` | `active` | `{ active: true }` |

---

### `nullFormat`

How to encode null values.

| Format | Encoded |
|--------|---------|
| `"default"` | `key` (key only, no value) |
| `"hidden"` | (omitted from query string) |

## Types

```typescript
import type {
  // Format types
  ArrayFormat,      // "none" | "brackets" | "index" | "comma"
  BooleanFormat,    // "none" | "string" | "empty-true"
  NullFormat,       // "default" | "hidden"

  // Options
  Options,          // { arrayFormat?, booleanFormat?, nullFormat? }
  FinalOptions,     // Options with all fields required (internal)

  // Parameter types
  QueryParamPrimitive,  // string | number | boolean | null
  QueryParamValue,      // QueryParamPrimitive | QueryParamPrimitive[]
  SearchParams,         // Record<string, QueryParamValue | undefined>

  // Response types
  OmitResponse,     // { querystring, removedParams }
  KeepResponse,     // { querystring, keptParams }

  // Internal
  DecodeResult,     // boolean | string | null
} from "search-params";
```

### Type Definitions

```typescript
// Primitive types for query params
type QueryParamPrimitive = string | number | boolean | null;

// Single param value (primitive or array)
type QueryParamValue = QueryParamPrimitive | QueryParamPrimitive[];

// Query params object
type SearchParams = Record<string, QueryParamValue | undefined>;

// Response types
interface OmitResponse {
  querystring: string;
  removedParams: Record<string, unknown>;
}

interface KeepResponse {
  querystring: string;
  keptParams: Record<string, unknown>;
}
```

## Performance

- **Fast path for common cases** — empty strings, no options
- **Single-pass parsing** — no intermediate arrays
- **Direct mutation** — `parseInto` avoids object allocation
- **Set-based filtering** — O(1) lookup for omit/keep operations

## Related Packages

- [route-tree](../route-tree) — uses search-params for query handling (internal)
- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — core router

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
