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

> **Strip is per-key — cross-field `refine` issues aren't stripped.** Recovery removes only the keys a validation issue names in its `path`. A cross-field `.refine()` / `.superRefine()` that reports a **path-less** issue (it concerns the whole object, not one key) strips **nothing** — the invalid combination reaches `state` (dev still logs `console.error`; production is silent). To recover, give the refine a `path` (`{ message, path: ["max"] }`) so the offending key is stripped, or handle it in `onError`. Example: `z.object({ min: z.number(), max: z.number() }).refine((v) => v.min < v.max)` navigated with `{ min: 10, max: 5 }` leaves `{ min: 10, max: 5 }` in `state`.

### `defaultParams` must satisfy the schema (contract)

The plugin's runtime guarantee is scoped to **user input**: an invalid _incoming_ param (from the URL or a `navigate()` call) never reaches `state`. It does **not** validate `defaultParams` at runtime — those are **trusted developer config**, injected by the router core _below_ the layer this plugin intercepts. So a `defaultParams` value that violates its own `searchSchema` **will reach `state.search` and the URL** (`state.path`), on every navigation, in **every** `mode` — including `mode: "production"` (a query-declared default lands in `state.search` since core routes defaults by channel, #1549):

```typescript
{
  name: "products",
  path: "/products?page",
  defaultParams: { page: -5 },              // ← violates the schema below
  searchSchema: z.object({ page: z.number().positive() }),
}
await router.navigate("products");          // no input supplied by the caller
router.getState().search;                   // { page: -5 }  ← invalid default reaches state
router.getState().path;                     // "/products?page=-5"  ← and the URL
```

In `mode: "development"` the plugin **warns** about a schema-violating `defaultParams` at authoring time (at `usePlugin()`, and when routes are added / replaced / updated) — a config lint, not a runtime block. `mode: "production"` skips that warning. Either way the value is **not** blocked at runtime, and `onError` does not change this (core injects the default independently of the callback).

**Fix:** keep each route's `defaultParams` consistent with its `searchSchema`. Treat the dev warning as a config error to resolve, not a recoverable runtime condition. To _fill_ absent params from within the schema instead, use the schema's own `.default()` (e.g. Zod `z.number().default(1)`) — those values are validated by construction.

### Strict mode

```typescript
router.usePlugin(searchSchemaPlugin({ strict: true }));
// Unknown params (not described in schema) are removed on every navigation
```

Per-route schema configuration (e.g., Zod's `.passthrough()` or `.strip()`) controls which keys appear in the schema output and effectively overrides the `strict` option for that route.

### Composition with `@real-router/persistent-params-plugin`

Both plugins register a `forwardState` interceptor, and core runs interceptors **LIFO** (last-registered wraps the rest). The schema validates the result of the inner (earlier-registered) layers, so **registration order decides whether persistent params are validated**:

```typescript
// RECOMMENDED — persistent-params first, search-schema second:
router.usePlugin(persistentParamsPluginFactory({ page: 1 }));
router.usePlugin(searchSchemaPlugin());
// schema is outermost → it validates the injected persistent params too
// → an invalid persisted value is stripped and its default restored

// ALTERNATIVE — search-schema first, persistent-params second:
router.usePlugin(searchSchemaPlugin());
router.usePlugin(persistentParamsPluginFactory({ page: 1 }));
// persistent-params injects after the schema ran → persistent params bypass validation
```

Prefer the recommended order (schema outermost) so `state` is validated as a whole. Reach for the alternative only when persistent/infra params must deliberately skip the schema. Swapping the two `usePlugin` lines silently flips the guarantee.

> **Caveat:** the recommended order validates `state.params`, not `state.path`. `persistent-params-plugin` also registers a **`buildPath`** interceptor, which this plugin does not wrap — so an invalid persisted value is stripped from `state.params` but still reaches `state.path` (persistent, reload-stable). Give persisted keys a `defaultParams` on schema'd routes to close it (core's merge overrides the injected value). Also: the alternative-order leak only affects keys **without** a route default — stored params fill *under* incoming ones, so a key with a default is supplied by core and never leaks. (#1231)

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
