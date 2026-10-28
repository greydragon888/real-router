# @real-router/search-schema-plugin

[![npm](https://img.shields.io/npm/v/@real-router/search-schema-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/search-schema-plugin)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/search-schema-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/search-schema-plugin)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/search-schema-plugin&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/search-schema-plugin&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Validate and sanitize route search parameters at runtime using any [Standard Schema V1](https://github.com/standard-schema/standard-schema)-compatible library in [Real-Router](https://github.com/greydragon888/real-router).

```typescript
// Without plugin — tampered URL params reach your app unvalidated:
// User visits: /products?page=-1&limit=99999
router.getState()?.search; // { page: -1, limit: 99999 } — crashes pagination

// With plugin — invalid params stripped, route defaults restored automatically:
router.usePlugin(searchSchemaPlugin());
// User visits: /products?page=-1&limit=99999
router.getState()?.search; // { page: 1, limit: 20 } — safe defaults from defaultSearch
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
    defaultSearch: { page: 1, limit: 20, sortBy: "price" },
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

| Option    | Type                                    | Default         | Description                                                                                                                                                                                                         |
| --------- | --------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`    | `"development" \| "production"`         | `"development"` | In development mode, logs invalid params with `console.error`. In production mode, strips silently without logging.                                                                                                 |
| `strict`  | `boolean`                               | `false`         | When `false`, unknown params pass through alongside schema output. When `true`, only the keys of the schema's output are kept, on every query the schema accepts — a repaired one included.                         |
| `onError` | `(routeName, params, issues) => Params` | `undefined`     | Custom error handler. When set, overrides both `mode` logging and the built-in recovery (strip, restore, validate again). It is called once each rejected number or boolean has been [tried as text](#numbers-and-booleans-are-tried-as-text), with the query that leaves and the schema's issues on it; returned params are used as-is without re-validation. |

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

### Numbers and booleans are tried as text

Under `numberFormat` / `booleanFormat: "auto"` (the default) the router decodes `?q=17` to the number `17` and `?q=true` to `true` before the schema sees them. When the schema rejects such a value — a key's value or an array element — the plugin runs it once more on the query with each one replaced by its text, `String(value)`: the text the URL holds. A schema that judges in stages — a discriminated union, a refinement that runs once the object parses — can name a number only once another value is text, so the plugin runs it again for each value it names next; no value is tried twice. A key whose text passes keeps it, every other key goes back as decoded, and recovery (below) goes by the schema's issues on that query — not on the text, which a zod refinement stopped by a type issue never judges:

```typescript
// Schema: z.object({ q: z.string().optional(), page: z.number().int().positive() })
// Route defaultSearch: { page: 1 }
// URL: /products?q=17&page=0
// Decoded:  { q: 17, page: 0 }      ← the schema rejects both
// As text:  { q: "17", page: "0" }  ← q passes; page's text is rejected too
// Settled:  { q: "17", page: 0 }    ← page back as decoded, which the schema rejects
// Recovery: page is stripped and restored from defaultSearch
// Result:   { q: "17", page: 1 } — as on /products?q=17&page=1
```

So under the default formats a schema whose fields accept only text settles the keys it declares as it does under `"none"` — unless the rejection names no key: a top-level `z.union()` or `.or()` of objects rejects the query as a whole, so nothing is tried and `{ q: 17 }` stays. The repair's run is not tried as text: a `z.discriminatedUnion("view", …)` that rejects only its discriminator — missing from the URL, or a value it does not know — names no number, so nothing is tried; the repair restores `view` from `defaultSearch: { view: "list" }`, and the number its run rejects stays as decoded — `?q=17` gives `{ view: "list", q: 17 }`, while the path the router prints, `?view=list&q=17`, gives `"17"`. A key the schema does not declare passes through with its decoded value, unless `strict` removes it. A rule over the whole query — a `.refine()` on the object, or a `.pipe()` into a second object — judges the query the runs settle on, where each key the text did not fix holds its decoded value; zod skips such a rule after a type issue, and the second object of a `.pipe()` after any issue, so it can strip or keep a key otherwise than under `"none"`. A field that takes one value or many can lose its key: `z.union([z.string(), z.array(z.string())])`, or the two joined with `.or()`, names the key itself when it holds several values and one of them is a number or a boolean (`?q=17&q=x`), and a `z.preprocess` that wraps a value in an array names an element of its own copy when the key holds one (`?q=17`); neither is a number the query holds there, so nothing is tried and the key is removed, where under `"none"` it is kept. A field with `.catch()` never rejects, so its fallback replaces the number. A number or boolean passed to `navigate()` or `buildPath()` is tried the same way. A key without a value decodes to `null`, which is not tried; under `booleanFormat: "empty-true"` it decodes to `true`, so a `z.string()` field keeps `"true"` and the URL prints `?q=true` — declare the field `z.boolean()` to read it as a flag.

A text run is a schema run like any other: a side effect in the schema runs again, and a schema that throws, or answers with a Promise, on a query that holds a text — which every run after the first can, the repair's included — refuses the navigation, and `buildPath()` throws (zod hands a throw back as a rejected Promise, which the plugin refuses as async). Report an issue instead of throwing.

### Invalid params + recovery

When schema validation fails, the plugin strips only the keys with validation issues, restores their `defaultSearch` values and validates the repaired query once more — so the kept keys come back as the schema outputs them:

```typescript
// Schema: z.object({ page: z.coerce.number().int().positive(), q: z.string().trim() })
// Route defaultSearch: { page: 1 }
// URL: /products?page=foo&q=%20shoes%20
// Schema fails: page is not a valid number
// Step 1 — strip invalid:   { q: " shoes " }
// Step 2 — restore default: { page: 1, q: " shoes " }  ← page restored from defaultSearch
// Step 3 — validate again:  { page: 1, q: "shoes" }    ← the schema's output
// Result: { page: 1, q: "shoes" } — as on /products?page=1&q=%20shoes%20
```

The repair runs the schema only after a rejection. A repaired query the schema still rejects has no output to write, so it is written back without coercion, transforms or `.default()`, and under `strict` with its undeclared keys. A path-less `refine` issue (below) leads there: it names no key to repair.

Write `defaultSearch` values in the form the schema outputs (`page: 1`, not `"1"`): a rejected key's default goes through the repair's run, while core merges the others as written. A schema that throws on a restored value refuses the navigation.

In `mode: "development"`, a `console.error` lists each issue before the recovery happens, with the value it is about in that query. Under a listed key the text did not fix follows what the last text run said about it, with its values as text, and each element tried as text that none of those issues names, with `no issue reported` — a rule may name only the first element it refuses, or the array as a whole. The message explains the decoding when a rejected value is a number, a boolean or `null`; the issues are its second argument. A key the text fixes is listed only when an issue on that query names it. On `/products?q=17&page=0` from the text-run example, zod 4 reads:

```text
[search-schema-plugin] Route "products": the schema rejected these search params; each takes its default value or is removed:
  page = 0 (number): Too small: expected number to be >0
  page as text "0": Invalid input: expected number, received string
The schema gets decoded values: under queryParams numberFormat / booleanFormat "auto" (the default) ?q=17 arrives as the number 17, ?q=true as true, and a key without a value as null. A rejected number or boolean — a key's value or an array element — is tried once more as its text.
```

> **Strip is per-key — cross-field `refine` issues aren't stripped.** Recovery removes only the keys a validation issue names in its `path`. A cross-field `.refine()` / `.superRefine()` that reports a **path-less** issue (it concerns the whole object, not one key) strips **nothing** — the invalid combination reaches `state` (dev still logs `console.error`; production is silent). To recover, give the refine a `path` (`{ message, path: ["max"] }`) so the offending key is stripped, or handle it in `onError`. Example: `z.object({ min: z.number(), max: z.number() }).refine((v) => v.min < v.max)` navigated with `{ min: 10, max: 5 }` leaves `{ min: 10, max: 5 }` in `state`.

### `defaultSearch` must satisfy the schema (contract)

The plugin's runtime guarantee is scoped to **user input**: an invalid _incoming_ param (from the URL or a `navigate()` call) never reaches `state`. It does **not** validate `defaultSearch` at runtime — those are **trusted developer config**, injected by the router core _below_ the layer this plugin intercepts. So a `defaultSearch` value that violates its own `searchSchema` **will reach `state.search` and the URL** (`state.path`), on every navigation, in **every** `mode` — including `mode: "production"`:

```typescript
{
  name: "products",
  path: "/products?page",
  defaultSearch: { page: -5 },              // ← violates the schema below
  searchSchema: z.object({ page: z.number().positive() }),
}
await router.navigate("products");          // no input supplied by the caller
router.getState()?.search;                  // { page: -5 }  ← invalid default reaches state
router.getState()?.path;                    // "/products?page=-5"  ← and the URL
```

In `mode: "development"` the plugin **warns** about a schema-violating `defaultSearch` at authoring time (at `usePlugin()`, and when routes are added / replaced / updated) — a config lint, not a runtime block. `mode: "production"` skips that warning. Either way the value is **not** blocked at runtime, and `onError` does not change this (core injects the default independently of the callback).

**Fix:** keep each route's `defaultSearch` consistent with its `searchSchema`. Treat the dev warning as a config error to resolve, not a recoverable runtime condition. To _fill_ absent params from within the schema instead, use the schema's own `.default()` (e.g. Zod `z.number().default(1)`) — those values are validated by construction.

### Strict mode

```typescript
router.usePlugin(searchSchemaPlugin({ strict: true }));
// Unknown params (not described in schema) are removed from every query the schema accepts, a repaired one included
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

> **What gets validated:** the route's **query channel** — the explicit `search` argument, a v1 single-bag caller's query riding in the params bag, and anything an inner interceptor injected there (e.g. `persistent-params-plugin`) — on **both** directions (`navigate` and URL→State). The route's **path slots** are never shown to the schema, so a query schema cannot rewrite or (under `strict`) delete them. (#1564)
>
> **The href is governed too, since core #2087.** `router.buildPath` runs the `forwardState` seam on the caller's intent, so the URL a `<Link>` renders is the URL a click commits — the schema answers on both, and no change was needed in this package.
>
> **And so is what other plugins inject.** `persistent-params-plugin` injects on that same `forwardState` seam and nowhere else, so a stored value this schema rejects — a number or a boolean once its text is rejected too — reaches neither the printed URL nor `state.search` — with the recommended registration order, which puts the schema outermost. (#1231, #1563)

## Use Cases

### Form Validation — Pagination and Filters

```typescript
const routes = [
  {
    name: "users",
    path: "/users?page&pageSize&status",
    defaultSearch: { page: 1, pageSize: 25, status: "active" },
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
// /search?q=17 → { q: "17", page: 1 }: q is rejected as the number 17 and kept as its text
```

### Custom Error Reporting

```typescript
router.usePlugin(
  searchSchemaPlugin({
    onError: (routeName, params, issues) => {
      analytics.track("invalid_search_params", { routeName, issues });
      return {}; // empty params — let defaultSearch fill in from the route
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
| `z.string()`           | `numberFormat: "auto"` (default)     | `?q=17`          | `{ q: 17 }`, then [as text](#numbers-and-booleans-are-tried-as-text) `{ q: "17" }` |
| `z.array(z.string())`  | `arrayFormat: "brackets"` (or other) | `?tags[]=a&tags[]=b` | `{ tags: ["a", "b"] }` |

Under `"auto"` a value that reads as a number or a boolean arrives as one; when the schema rejects it, the plugin [tries its text](#numbers-and-booleans-are-tried-as-text) — an array element's too.

**Gotcha — mismatched config:** if schema declares `z.boolean()` but `booleanFormat: "none"` is set, the plugin receives the string `"true"` / `"false"` and Zod's `z.boolean()` will reject it. Fix:

- Switch to `booleanFormat: "auto"` (recommended), OR
- Use `z.coerce.boolean()` in the schema (accepts strings)

Same applies for numbers — use `z.coerce.number()` if `numberFormat: "none"` is set.

**Recommended baseline:** keep `queryParams` defaults (`booleanFormat: "auto"`, `numberFormat: "auto"`, `nullFormat: "default"`) unless you have a specific URL aesthetic preference. Defaults align well with typical Zod/Valibot/ArkType schemas: a numeric or boolean field gets a typed value, and a text field gets the text back when it rejects one — the exceptions are under [Numbers and booleans are tried as text](#numbers-and-booleans-are-tried-as-text).

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
