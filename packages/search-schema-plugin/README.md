# @real-router/search-schema-plugin

[![npm](https://img.shields.io/npm/v/@real-router/search-schema-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/search-schema-plugin)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/search-schema-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/search-schema-plugin)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/search-schema-plugin&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/search-schema-plugin&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Validate and sanitize route search parameters at runtime using any [Standard Schema V1](https://github.com/standard-schema/standard-schema)-compatible library in [Real-Router](https://github.com/greydragon888/real-router).

```typescript
// Without plugin — tampered URL params reach your app unvalidated:
// User visits: /products?page=-1&limit=99999
router.getState().params; // { page: -1, limit: 99999 } — crashes pagination

// With plugin — invalid params stripped, route defaults restored automatically:
router.usePlugin(searchSchemaPlugin());
// User visits: /products?page=-1&limit=99999
router.getState().params; // { page: 1, limit: 20 } — safe defaults from defaultParams
```

## Installation

```bash
npm install @real-router/search-schema-plugin
```

**Peer dependency:** `@real-router/core`

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { searchSchemaPlugin } from "@real-router/search-schema-plugin";
import { z } from "zod"; // any Standard Schema V1 library — Zod 3.24+, Valibot 1.0+, ArkType

const routes = [
  {
    name: "products",
    path: "/products?page&limit&sortBy",
    defaultParams: { page: 1, limit: 20, sortBy: "price" },
    searchSchema: z.object({
      page: z.number().int().positive(),
      limit: z.number().int().min(1).max(100),
      sortBy: z.enum(["price", "name", "date"]),
    }),
  },
];

const router = createRouter(routes, {
  queryParams: { numberFormat: "auto" },
});
router.usePlugin(searchSchemaPlugin({ mode: "development" }));
```

> **Schema libraries:** Any library implementing [Standard Schema V1](https://github.com/standard-schema/standard-schema) works — Zod 3.24+, Valibot 1.0+, ArkType. Install and configure your chosen library separately; the plugin has no schema-library dependency.

## TypeScript Support

Import `@real-router/search-schema-plugin` to enable TypeScript support for `searchSchema` on route definitions:

```typescript
import "@real-router/search-schema-plugin"; // enables Route.searchSchema type

const routes = [
  { name: "users", path: "/users", searchSchema: z.object({ page: z.number() }) },
];
```

This works via [module augmentation](https://www.typescriptlang.org/docs/handbook/declaration-merging.html) — the package extends the `Route` interface from `@real-router/core`.

## Configuration

| Option    | Type                                    | Default         | Description                                                                                                                                                                                    |
| --------- | --------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`    | `"development" \| "production"`         | `"development"` | In development mode, logs invalid params with `console.error`. In production mode, strips silently without logging.                                                                            |
| `strict`  | `boolean`                               | `false`         | When `false`, unknown params pass through alongside schema output. When `true`, only params present in the schema output are kept — unknown keys are removed.                                  |
| `onError` | `(routeName, params, issues) => Params` | `undefined`     | Custom error handler. When set, overrides both `mode` logging and the built-in strip+merge recovery. Receives the raw validation issues; returned params are used as-is without re-validation. |

## Behavior

### Valid params

When schema validation succeeds, the resolved params are merged back based on `strict`:

```typescript
// strict: false (default) — schema output merged over original, unknown keys preserved
// Original params: { page: 1, filter: "electronics", utm_source: "google" }
// Schema output:   { page: 1, filter: "electronics" }  (Zod strip mode removes unknowns)
// Result:          { page: 1, filter: "electronics", utm_source: "google" }

// strict: true — schema output used directly, unknown keys removed
// Result: { page: 1, filter: "electronics" }
```

### Invalid params + recovery

When schema validation fails, the plugin strips only the keys with validation issues and restores their `defaultParams` values:

```typescript
// Route defaultParams: { page: 1, sortBy: "price" }
// URL: /products?page=foo&sortBy=price
// Schema fails: page is not a valid number
// Step 1 — strip invalid: { sortBy: "price" }
// Step 2 — merge defaults: { page: 1, sortBy: "price" }  ← page restored from defaultParams
// Result: { page: 1, sortBy: "price" }
```

In `mode: "development"`, a `console.error` is emitted with the route name and validation issues before the recovery happens.

### Strict mode

```typescript
router.usePlugin(searchSchemaPlugin({ strict: true }));
// Unknown params (not described in schema) are removed on every navigation
```

Per-route schema configuration (e.g., Zod's `.passthrough()` or `.strip()`) controls which keys appear in the schema output and effectively overrides the `strict` option for that route.

## Use Cases

### Form Validation — Pagination and Filters

```typescript
const routes = [
  {
    name: "users",
    path: "/users?page&pageSize&status",
    defaultParams: { page: 1, pageSize: 25, status: "active" },
    searchSchema: z.object({
      page: z.number().int().positive(),
      pageSize: z.number().int().min(1).max(100),
      status: z.enum(["active", "inactive", "all"]),
    }),
  },
];

const router = createRouter(routes, {
  queryParams: { numberFormat: "auto" },
});
router.usePlugin(searchSchemaPlugin());
// /users?page=0&status=deleted → { page: 1, pageSize: 25, status: "active" }
```

### Search Params with Automatic Type Coercion

```typescript
const searchSchema = z.object({
  q: z.string().min(1),
  page: z.number().int().positive().default(1),
});

const routes = [{ name: "search", path: "/search?q&page", searchSchema }];

// numberFormat: "auto" handles string→number coercion at the search-params layer,
// so schemas validate already-typed values (not raw URL strings)
const router = createRouter(routes, {
  queryParams: { numberFormat: "auto" },
});
router.usePlugin(searchSchemaPlugin());
```

### Custom Error Reporting

```typescript
router.usePlugin(
  searchSchemaPlugin({
    onError: (routeName, params, issues) => {
      analytics.track("invalid_search_params", { routeName, issues });
      return {}; // empty params — let defaultParams fill in from the route
    },
  }),
);
```

## Schema ↔ Format Coercion

The plugin validates **decoded** values (not raw URL strings). The coercion from URL string to typed value happens at the `search-params` layer, controlled by `queryParams` options on the router. Align your schema types with the format options:

| Schema                 | Required `queryParams` option        | URL example      | Plugin sees       |
| ---------------------- | ------------------------------------ | ---------------- | ----------------- |
| `z.boolean()`          | `booleanFormat: "auto"` (default)    | `?compact=true`  | `{ compact: true }` |
| `z.boolean()`          | `booleanFormat: "empty-true"`        | `?compact`       | `{ compact: true }` |
| `z.number().int()`     | `numberFormat: "auto"` (default)     | `?page=2`        | `{ page: 2 }`     |
| `z.string()`           | Any                                  | `?q=hello`       | `{ q: "hello" }`  |
| `z.array(z.string())`  | `arrayFormat: "brackets"` (or other) | `?tags[]=a&tags[]=b` | `{ tags: ["a", "b"] }` |

**Gotcha — mismatched config:** if schema declares `z.boolean()` but `booleanFormat: "none"` is set, the plugin receives the string `"true"` / `"false"` and Zod's `z.boolean()` will reject it. Fix:

- Switch to `booleanFormat: "auto"` (recommended), OR
- Use `z.coerce.boolean()` in the schema (accepts strings)

Same applies for numbers — use `z.coerce.number()` if `numberFormat: "none"` is set.

**Recommended baseline:** keep `queryParams` defaults (`booleanFormat: "auto"`, `numberFormat: "auto"`, `nullFormat: "default"`) unless you have a specific URL aesthetic preference. Defaults align well with typical Zod/Valibot/ArkType schemas.

See [@real-router/core — Params Contract](../core/README.md#params-contract) for the full type-to-URL mapping.

## Documentation

Full documentation: [Wiki — search-schema-plugin](https://github.com/greydragon888/real-router/wiki/search-schema-plugin)

- [Standard Schema V1 compatibility](https://github.com/greydragon888/real-router/wiki/search-schema-plugin#standard-schema)
- [Error recovery](https://github.com/greydragon888/real-router/wiki/search-schema-plugin#error-recovery)
- [Strict mode](https://github.com/greydragon888/real-router/wiki/search-schema-plugin#strict-mode)

## Related Packages

| Package                                                                                                      | Description                                 |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| [@real-router/core](https://www.npmjs.com/package/@real-router/core)                                         | Core router (required peer dependency)      |
| [@real-router/persistent-params-plugin](https://www.npmjs.com/package/@real-router/persistent-params-plugin) | Persist query parameters across navigations |
| [@real-router/validation-plugin](https://www.npmjs.com/package/@real-router/validation-plugin)               | Runtime argument validation for development |

## Contributing

See [contributing guidelines](../../CONTRIBUTING.md) for development setup and PR process.

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
