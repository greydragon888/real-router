# Architecture

> Detailed architecture for AI agents and contributors

## Overview

`@real-router/search-schema-plugin` validates route search parameters against a [Standard Schema V1](https://github.com/standard-schema/standard-schema)-compatible schema attached to each route definition. On every navigation — whether initiated by `router.navigate()` or by the browser parsing a URL — the plugin intercepts the resolved state, validates its params against the route's `searchSchema`, and either passes them through (valid), strips invalid keys and restores `defaultParams` (invalid), or delegates entirely to a custom `onError` handler. The plugin works with any schema library that implements Standard Schema V1 (Zod 3.24+, Valibot 1.0+, ArkType) without importing any of them.

**Core role:** A stateless validation layer that sits after core's `forwardState` pipeline. Reads `searchSchema` from route configuration, validates deserialized params, and returns a safe state. Contains no URL parsing or browser logic — only schema dispatch, key stripping, and default merging.

**Integration points with the core:**

- `addInterceptor("forwardState", ...)` — validates params of every resolved state (both URL→State and State→URL directions)
- `routesApi.subscribeChanges(...)` — re-validates `defaultParams` on `add`/`update`/`replace` route-tree mutations (development mode only)
- `pluginApi.getRouteConfig(name)` — reads the `searchSchema` field from a route's config at validation time
- `pluginApi.getTree()` — walks the full route tree at plugin initialization to validate existing `defaultParams` (development mode only)
- `routesApi.get(name)` — reads `defaultParams` for error recovery (merging defaults over stripped params)
- Plugin hook (`teardown`) — removes the interceptor and the TREE_CHANGED subscription

## Package Structure

```
search-schema-plugin/
├── src/
│   ├── index.ts        — Public API (exports factory + types + Route module augmentation)
│   ├── factory.ts      — searchSchemaPlugin (options validation, freeze, returns PluginFactory)
│   ├── plugin.ts       — SearchSchemaPlugin class (forwardState interceptor + TREE_CHANGED subscription, tree walk)
│   ├── helpers.ts      — Pure param utilities (getInvalidKeys, omitKeys)
│   ├── types.ts        — StandardSchemaV1 types (inline), SearchSchemaPluginOptions
│   ├── constants.ts    — ERROR_PREFIX
│   └── validation.ts   — validateOptions (factory-time type checks)
```

## Module Dependency Graph

```
index.ts
    └── factory.ts
            ├── plugin.ts
            │       ├── helpers.ts
            │       │       └── (types.ts — types only)
            │       ├── (types.ts — types only)
            │       └── constants.ts
            └── validation.ts
                    └── constants.ts

types.ts     ← imported by factory.ts, plugin.ts, helpers.ts, validation.ts
constants.ts ← imported by plugin.ts, validation.ts
```

External dependencies:

| Dependency              | What it provides                                         | Used in                                 |
| ----------------------- | -------------------------------------------------------- | --------------------------------------- |
| `@real-router/core`     | `Params`, `Plugin`, `Route`, `PluginFactory` types       | `factory.ts`, `plugin.ts`, `helpers.ts` |
| `@real-router/core/api` | `getPluginApi`, `getRoutesApi`, `PluginApi`, `RoutesApi` | `factory.ts`, `plugin.ts`               |

No schema library dependency — Standard Schema V1 types are inlined in `types.ts`.

## Factory + Class Pattern

### Separation of Concerns

`searchSchemaPlugin()` in `factory.ts` and `SearchSchemaPlugin` in `plugin.ts` are intentionally separate:

```
searchSchemaPlugin(options)     ← factory.ts
        │
        │  Runs once on call:
        │  - validateOptions(options)       ← throws on invalid mode/strict/onError
        │  - Object.freeze({ ...options })  ← immutable config snapshot
        │
        └── returns PluginFactory (closure)
                │
                │  Called by the router on router.usePlugin():
                │
                ├── pluginApi = getPluginApi(router)
                ├── routesApi = getRoutesApi(router)
                └── new SearchSchemaPlugin(pluginApi, routesApi, frozenOptions)
                            │
                            │  Constructor:
                            │  - #validateExistingDefaultParams()  ← dev mode: tree walk
                            │  - pluginApi.addInterceptor("forwardState", ...)
                            │  - routesApi.subscribeChanges(...)  ← dev mode only
                            │
                            └── .getPlugin()  → Plugin { teardown }
```

**Why this split instead of a single object?**

- `factory.ts` runs once — options validation doesn't repeat on every `usePlugin()` call
- Frozen options object is created once and shared safely across calls (immutable)
- `SearchSchemaPlugin` encapsulates the interceptor + subscription unsubscribe functions — a class makes the private field discipline explicit
- Testability: `SearchSchemaPlugin` can be instantiated directly with a mock `PluginApi` and `RoutesApi`

### Creation Flow

```typescript
// factory.ts
export function searchSchemaPlugin(
  options: SearchSchemaPluginOptions = {},
): PluginFactory {
  validateOptions(options);

  const frozenOptions: SearchSchemaPluginOptions = Object.freeze({
    ...options,
  });

  return (router): Plugin => {
    const pluginApi = getPluginApi(router);
    const routesApi = getRoutesApi(router);
    const plugin = new SearchSchemaPlugin(pluginApi, routesApi, frozenOptions);

    return plugin.getPlugin();
  };
}
```

### Constructor: Interceptor + Subscription Registration

The constructor registers the `forwardState` interceptor immediately and, in development mode, subscribes to route-tree mutations. There is no mutable state to set up and no rollback path — both registrations are infallible (pure array push):

```typescript
// plugin.ts constructor (simplified)
this.#validateExistingDefaultParams(); // dev mode: walk route tree

this.#removeForwardStateInterceptor = this.#pluginApi.addInterceptor(
  "forwardState",
  (next, routeName, routeParams, routeSearch) => {
    const result = next(routeName, routeParams, routeSearch); // core resolves state first
    return this.#validateState(result, routeSearch !== undefined); // then schema validates whichever channel holds the query (RFC-4 M2 / #1548)
  },
);

// dev mode only — re-validate defaultParams on add/update/replace
this.#removeChangesSubscription =
  this.#mode === "development"
    ? this.#routesApi.subscribeChanges((event) => {
        this.#onTreeChanged(event); // validates affected route names
      })
    : () => {};
```

### getPlugin(): teardown only, no side effects

`getPlugin()` returns a plain `Plugin` object with a single `teardown` hook. It does not register anything — all registration happens in the constructor. Calling `getPlugin()` multiple times is safe.

## Data Flow: Validation Pipeline

### forwardState interceptor

```
navigate(name, params, search) / matchPath(url)
        │
        ▼
  forwardState interceptor (registered in constructor)
        │
        ├── result = next(routeName, routeParams, routeSearch)
        │     └── core builds/resolves State { name, params, search }
        │         (merges route defaultParams for undefined keys, channel-aware since #1549)
        │
        └── #validateState(result, useSearch = routeSearch !== undefined)
              │
              ├── schema = pluginApi.getRouteConfig(result.name)?.searchSchema
              │
              ├── no schema?
              │     YES: return result unchanged
              │
              ├── channel = useSearch ? result.search : result.params
              │     (URL→State/matchPath: query already in result.search;
              │      State→URL/navigate: query still rides in the params bag,
              │      not yet slot-shifted — RFC-4 M2 / #1548)
              │
              ├── schema["~standard"].validate(channel)
              │
              ├── validation returns Promise?
              │     YES: throw TypeError  ← async schemas not supported
              │
              ├── "value" in validation (success path)
              │     │
              │     ├── strict: false → writeBack({ ...channel, ...validation.value })
              │     │                   (unknown keys preserved from original)
              │     │
              │     └── strict: true  → writeBack(validation.value)
              │                         (only schema output, unknowns removed)
              │
              └── "issues" in validation (error path)
                    │
                    ├── onError set?
                    │     YES: return writeBack(onError(result.name, channel, issues))
                    │          (no logging, no strip — full callback control)
                    │
                    ├── mode === "development"?
                    │     YES: console.error(routeName, issues)
                    │
                    ├── invalidKeys = getInvalidKeys(issues)
                    │     └── extracts top-level path[0] key from each issue with a path
                    │
                    ├── stripped = omitKeys(channel, invalidKeys)
                    │
                    ├── defaults = routesApi.get(result.name)?.defaultParams
                    │
                    └── return writeBack(defaults ? { ...defaults, ...stripped } : stripped)
                                  ← defaults fill stripped keys; valid keys kept as-is

  writeBack(validated) → useSearch ? { ...result, search: validated }
                                    : { ...result, params: validated }
```

### Happy path (valid params)

```
navigate("products", { page: 2, sortBy: "name", utm_source: "email" })
        │
        ▼
  next() → State { params: { page: 2, sortBy: "name", utm_source: "email" } }
        │
        ▼
  schema.validate({ page: 2, sortBy: "name", utm_source: "email" })
  → { value: { page: 2, sortBy: "name" } }  (Zod strips unknown keys in output)
        │
        ▼
  strict: false → { page: 2, sortBy: "name", utm_source: "email" }  ← utm_source preserved
  strict: true  → { page: 2, sortBy: "name" }                        ← utm_source removed
```

### Error path (invalid params + recovery)

```
navigate("products", { page: -1, sortBy: "name" })   — or URL: /products?page=-1
        │
        ▼
  next() → State { params: { page: -1, sortBy: "name" } }
        │         (defaultParams.page=1 not applied — page is defined, just invalid)
        ▼
  schema.validate({ page: -1, sortBy: "name" })
  → { issues: [{ message: "...", path: ["page"] }] }
        │
        ▼  mode: "development"
  console.error('...[search-schema-plugin] Route "products": invalid search params', issues)
        │
        ▼
  invalidKeys = { "page" }
  stripped    = { sortBy: "name" }
  defaults    = { page: 1, limit: 20, sortBy: "price" }
  restored    = { page: 1, limit: 20, sortBy: "name" }
                 ← defaults fill stripped "page"; valid "sortBy" kept from stripped
```

### URL→State and State→URL: single validation point

The `forwardState` interceptor handles both navigation directions:

```
URL → State:
  Browser URL parsed → decodeParams → core forwardState (merges defaults)
  → [forwardState interceptor: schema validates]
  → State committed

State → URL:
  navigate(name, params, search) → core forwardState (merges defaults)
  → [forwardState interceptor: schema validates whichever channel holds the query]
  → encodeParams → URL built
```

Schema sees deserialized objects, not raw query strings. `z.number().positive()` validates the number `2`, not the string `"2"`.

### buildPath is NOT affected by schema validation

`router.buildPath()` goes through the `buildPath` interceptor chain, which is **separate** from `forwardState`. This plugin only registers a `forwardState` interceptor — it does NOT register a `buildPath` interceptor. Consequence:

```
router.navigate("search", { page: "bad" })
  → forwardState interceptor → schema validates → page stripped → default page=1
  → URL built with page=1  ✓

router.buildPath("search", { page: "bad" })
  → buildPath interceptor chain (no schema plugin here)
  → URL built with page=bad  ← no validation
```

During `navigate`, the core calls `buildPath` internally with params that have **already been validated** by `forwardState`. So the navigate-produced URL always contains clean params. But a standalone `buildPath()` call bypasses `forwardState` entirely.

This is by design: `buildPath` is a pure URL builder. Validation is a navigation-time concern.

## Teardown Lifecycle

```
unsubscribe() or router.dispose()
        │
        ▼
  Plugin.teardown()
        │
        ├── #removeForwardStateInterceptor()
        │     └── pure array.splice — cannot throw
        │
        └── #removeAddInterceptor()
              └── pure array.splice — cannot throw
```

Both unsubscribe calls are unconditional and infallible. Unlike `persistent-params-plugin`, there is no `setRootPath` call to restore — the plugin makes no global router state changes beyond interceptor registration.

## Validation

### Factory-time options validation (runs once)

`validateOptions(options)` in `validation.ts` is called before the `PluginFactory` closure is created:

| Check     | Rule                                                    |
| --------- | ------------------------------------------------------- |
| `mode`    | Must be `undefined`, `"development"`, or `"production"` |
| `strict`  | Must be `undefined` or `boolean`                        |
| `onError` | Must be `undefined` or `function`                       |

Throws `TypeError` with a descriptive message on any violation. The factory never returns a `PluginFactory` if options are invalid.

### Dev-time defaultParams validation (constructor + TREE_CHANGED)

In development mode only, the plugin validates that each route's `defaultParams` pass its own `searchSchema`. This catches configuration mismatches early — before any navigation happens.

**At constructor time** — existing routes:

```
constructor()
        │
        ├── mode !== "development"? → skip
        │
        └── #validateExistingDefaultParams()
              └── #validateRouteTreeDefaultParams()
                    └── #walkTree(pluginApi.getTree())
                          │
                          └── for each node with fullName:
                                #validateSingleRouteDefaultParams(node.fullName)
                                  │
                                  ├── no schema for route? → skip
                                  ├── no defaultParams? → skip
                                  ├── schema.validate(defaultParams) returns Promise? → skip
                                  └── "issues" in validation?
                                        YES: console.warn(routeName, issues)
```

**At TREE_CHANGED time** (dev mode only) — runtime tree mutations:

```
routesApi.add / update / replace / remove / clear
        │
        ▼
  TREE_CHANGED event (post-commit)
        │
        └── #onTreeChanged(event)
              ├── op "add" / "replace": for each route in event.added (FLAT,
              │     full dotted names) → #validateSingleRouteDefaultParams(route.name)
              ├── op "update": if event.patch.defaultParams changed
              │     → #validateSingleRouteDefaultParams(event.name)
              └── op "remove" / "clear": no-op (routes gone)
                    (same single-route check as above)
```

### Runtime schema validation (forwardState interceptor)

On every navigation, `#validateState` calls `schema["~standard"].validate(params)`. The Standard Schema V1 contract guarantees:

- **Success:** returns `{ value: Output }` — typed, coerced, transformed output
- **Failure:** returns `{ issues: readonly StandardSchemaV1Issue[] }` — array of validation problems
- **Async:** returns a `Promise` — thrown immediately (synchronous pipeline only)

Issues with a `path` array contribute to key-level stripping via `getInvalidKeys`. Issues without a path (object-level failures) do not produce strippable keys — the whole param set passes through the strip step unchanged for those issues.

## Error Recovery Strategy

Recovery applies only when `onError` is not set. The sequence is:

```
1. getInvalidKeys(issues)
      └── for each issue with issue.path.length > 0:
            extract issue.path[0] as string key
            → Set<string> of invalid top-level keys

2. omitKeys(channel, invalidKeys)
      └── shallow copy of the validated channel (state.search or state.params —
          RFC-4 M2 / #1548) without invalid keys
          → "stripped" params

3. { ...defaults, ...stripped }
      └── spread defaults first (fills stripped keys with route defaults)
          spread stripped second (keeps valid keys at their navigated values)
          → restored params, written back to the same channel
```

**Mode behavior:**

| Scenario                        | `console.error`       | Strip + merge defaults |
| ------------------------------- | --------------------- | ---------------------- |
| `mode: "development"` (default) | Yes — before strip    | Yes                    |
| `mode: "production"`            | No                    | Yes                    |
| `onError` set (any mode)        | No — callback owns it | No — callback owns it  |

**`onError` contract:**

- Receives: `(routeName: string, params: Params, issues: readonly StandardSchemaV1Issue[])`
- Must return: `Params` — used as-is, no re-validation (avoids infinite loops)
- Exceptions from `onError` propagate up without suppression — consistent with interceptor behavior in core

## Performance

| Optimization                                       | Location     | Effect                                                                       |
| -------------------------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| `Object.freeze({ ...options })`                    | `factory.ts` | Options immutable after factory call; prevents accidental mutation           |
| Schema lookup via `getRouteConfig`                 | `plugin.ts`  | O(1) map lookup per navigation — no route tree traversal at runtime          |
| Early return when no schema                        | `plugin.ts`  | Routes without `searchSchema` bypass all validation — zero overhead          |
| `getInvalidKeys` with `Set`                        | `helpers.ts` | O(n issues) build, O(1) membership checks in `omitKeys`                      |
| `omitKeys` single pass                             | `helpers.ts` | One `Object.keys` iteration — no intermediate structures                     |
| Dev-time defaultParams check skipped in production | `plugin.ts`  | Tree walk gated on `mode !== "development"`; the TREE_CHANGED subscription is not registered at all in production |

## Related Documents

- [ARCHITECTURE.md](../../ARCHITECTURE.md) — System architecture of the monorepo
- [core/ARCHITECTURE.md](../core/ARCHITECTURE.md) — Core architecture (Plugin API, forwardState interceptor, addInterceptor)
- [persistent-params-plugin/ARCHITECTURE.md](../persistent-params-plugin/ARCHITECTURE.md) — Example of a stateful plugin using the same interceptor pattern
- [INVARIANTS.md](INVARIANTS.md) — Property-based test invariants
