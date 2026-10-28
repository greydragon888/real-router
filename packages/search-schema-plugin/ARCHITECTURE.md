# Architecture

> Detailed architecture for AI agents and contributors

## Overview

`@real-router/search-schema-plugin` validates route search parameters against a [Standard Schema V1](https://github.com/standard-schema/standard-schema)-compatible schema attached to each route definition. On every navigation — whether initiated by `router.navigate()` or by the browser parsing a URL — the plugin intercepts the resolved state, validates its params against the route's `searchSchema` — trying each rejected number or boolean once more as its text — and either passes them through (valid), repairs them (invalid: strips the rejected keys, restores their `defaultSearch` values and validates the repaired query once more), or delegates entirely to a custom `onError` handler. The plugin works with any schema library that implements Standard Schema V1 (Zod 3.24+, Valibot 1.0+, ArkType) without importing any of them.

**Core role:** A stateless validation layer that sits after core's `forwardState` pipeline. Reads `searchSchema` from route configuration, validates deserialized params, and returns a safe state. Contains no URL parsing or browser logic — only schema dispatch, the text retry, key stripping, default merging and the development report.

**Integration points with the core:**

- `addInterceptor("forwardState", ...)` — validates params of every resolved state (both URL→State and State→URL directions)
- `routesApi.subscribeChanges(...)` — re-validates `defaultSearch` on `add`/`update`/`replace` route-tree mutations (development mode only)
- `pluginApi.getRouteConfig(name)` — reads the `searchSchema` field from a route's config at validation time
- `pluginApi.getTree()` — names the route's path slots on every validation (cached per tree), and is walked at plugin initialization to validate existing `defaultSearch` (development mode only)
- `routesApi.get(name)` — reads `defaultSearch` for error recovery (a rejected key takes its default) and for the dev-time check
- Plugin hook (`teardown`) — removes the interceptor and the TREE_CHANGED subscription

## Package Structure

```
search-schema-plugin/
├── src/
│   ├── index.ts        — Public API (exports factory + types + Route module augmentation)
│   ├── factory.ts      — searchSchemaPlugin (options validation, freeze, returns PluginFactory)
│   ├── plugin.ts       — SearchSchemaPlugin class (forwardState interceptor + TREE_CHANGED subscription, tree walk)
│   ├── helpers.ts      — Pure param utilities (getInvalidKeys, issueKey, namesOneOf, segmentKey, isNumberOrBoolean, readAsText, omitKeys, pickKeys, collectPathParams)
│   ├── report.ts       — describeRejection (the mode "development" console.error message)
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
            │       ├── report.ts
            │       │       ├── helpers.ts
            │       │       ├── (types.ts — types only)
            │       │       └── constants.ts
            │       ├── (types.ts — types only)
            │       └── constants.ts
            └── validation.ts
                    └── constants.ts

types.ts     ← imported by index.ts, factory.ts, plugin.ts, helpers.ts, report.ts, validation.ts
constants.ts ← imported by plugin.ts, report.ts, validation.ts
```

External dependencies:

| Dependency              | What it provides                                         | Used in                                 |
| ----------------------- | -------------------------------------------------------- | --------------------------------------- |
| `@real-router/core`     | `Params`, `Plugin`, `Route`, `PluginFactory` types       | `factory.ts`, `plugin.ts`, `helpers.ts`, `report.ts`, `types.ts` |
| `@real-router/core/api` | `getPluginApi`, `getRoutesApi`, `PluginApi`, `RoutesApi` | `factory.ts`, `plugin.ts`               |
| `@real-router/core/utils` | `putField`                                             | `plugin.ts`, `helpers.ts`               |

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
  (next, routeName, routeParams, routeSearch) =>
    // core resolves state first, then the schema validates the QUERY CHANNEL of
    // the result — one rule for both directions
    this.#validateState(next(routeName, routeParams, routeSearch)),
);

// dev mode only — re-validate defaultSearch on add/update/replace
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
        │         (a forwardTo hop's defaults are merged here; core merges the
        │          route's own defaults under the result afterwards)
        │
        └── #validateState(result)
              │
              ├── schema = pluginApi.getRouteConfig(result.name)?.searchSchema
              │
              ├── no schema?
              │     YES: return result unchanged
              │
              ├── pathParams = #pathParams(result.name)          ← the route's PATH slots,
              │     (its own + every ancestor's `paramMeta.urlParams`, read off the
              │      engine's own metadata via pluginApi.getTree(); cached per tree
              │      identity, an ABSOLUTE node restarts the accumulation)
              │
              ├── channel = { ...omitKeys(result.params, pathParams), ...result.search }
              │     ← the QUERY CHANNEL, wherever it lives: `search` is the
              │       canonical half (and where an inner interceptor injects), the
              │       params bag still carries a single-bag caller's query. Path
              │       slots are excluded — the schema never sees or rewrites them.
              │       A twin goes to `search`, mirroring core's precedence
              │
              ├── verdict = #validate(schema, routeName, channel)
              │     └── { input, value } or { input, issues, text } — see below
              │
              ├── "value" in verdict (success path)
              │     │
              │     ├── strict: false → writeBack({ ...verdict.input, ...verdict.value })
              │     │                   (unknown keys preserved from original)
              │     │
              │     └── strict: true  → writeBack(verdict.value)
              │                         (only schema output, unknowns removed)
              │
              └── "issues" in verdict (error path)
                    │
                    ├── onError set?
                    │     YES: return writeBack(onError(result.name, verdict.input, verdict.issues))
                    │          (no logging, no strip — full callback control)
                    │
                    ├── mode === "development"?
                    │     YES: console.error(describeRejection(routeName, input, issues, text), issues)
                    │
                    └── return writeBack(#repair(schema, routeName, verdict.input, verdict.issues))

  #validate(schema, routeName, channel)
        ├── first = schema["~standard"].validate(channel)   ← a Promise throws TypeError
        │     └── "value" in first? YES: { input: channel, value }
        │
        ├── rounds, while input = readAsText(channel, input, issues, done) names a value:
        │     ├── input: a copy where each number or boolean the latest
        │     │   issues name — a key's value, or an array element by its
        │     │   index — is String(value), where `channel` holds a number
        │     │   or a boolean too; a value in `done` is not named twice, so
        │     │   the rounds end
        │     └── run = schema["~standard"].validate(input)   ← a text run; a Promise throws
        │           └── "value" in run? YES: { input, value }
        │         (a schema that reports every issue at once takes one round;
        │          a staged one names the next value once the one before is text,
        │          and one that stops at its first issue takes a round per value)
        │
        ├── unfixed = the keys tried as text that the last run still rejects
        ├── text    = the last input, and the last run's issues about the unfixed keys (for the report)
        │
        └── the settled query — each key the text fixed as text, every other key
            as decoded — with the schema's issues on it:
              ├── no key unfixed:          { input: the last input, issues: the last run's }
              ├── every key tried unfixed: { input: channel,        issues: first's }
              └── otherwise: run = schema["~standard"].validate(settled)   ← a Promise throws
                    ├── "value" in run? YES: { input: settled, value }
                    └── { input: settled, issues: the run's }

  #repair(schema, routeName, channel, issues)
        ├── invalidKeys = getInvalidKeys(issues)
        │     └── extracts top-level path[0] key from each issue with a path
        │
        ├── stripped = omitKeys(channel, invalidKeys)
        │
        ├── defaults = route.defaultSearch   ← the route's query-channel defaults
        │
        ├── repaired = { ...pickKeys(defaults, invalidKeys), ...stripped }
        │     ← each rejected key takes its default, or is dropped
        │
        ├── schema["~standard"].validate(repaired)   ← the repair's run; a Promise throws
        │
        ├── "value" in the result?
        │     YES: { ...defaults, ...output }   ← output merged over `repaired`,
        │                                          or alone under strict
        │
        └── NO:  { ...defaults, ...stripped }   ← no output to write: the
                                                   repaired query as built

  #writeBack(result, pathParams, validated)
        ├── params := path slots verbatim + the validated value for every key that
        │             rode in the params bag (a key the schema dropped is removed)
        └── search := every validated key that did NOT go back to params, plus the
                      keys that came from `search` (a schema-invented key is a query
                      value by definition, so it lands here) — none came from it
                      when a single-bag buildPath(name, params) hands no `search`
```

### Happy path (valid params)

```
navigate("products", {}, { page: 2, sortBy: "name", utm_source: "email" })
        │
        ▼
  next() → State { search: { page: 2, sortBy: "name", utm_source: "email" } }
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
navigate("products", {}, { page: -1, sortBy: "name" })   — or URL: /products?page=-1&sortBy=name
        │
        ▼
  next() → State { search: { page: -1, sortBy: "name" } }
        │         (the route's own `defaultSearch` is not merged here — core merges it under the result)
        ▼
  schema.validate({ page: -1, sortBy: "name" })
  → { issues: [{ message: "...", path: ["page"] }] }
        │
        ▼  page is a number: the text run
  schema.validate({ page: "-1", sortBy: "name" })
  → { issues: [{ message: "...", path: ["page"] }] }   ← the text is rejected too
        │
        ▼  mode: "development"
  console.error('[search-schema-plugin] Route "products": the schema rejected these search params; …', issues)
        │     (a line per issue with its value as decoded, then what the last
        │      text run said about page as text, then how the router decodes —
        │      page goes back as decoded, so the issues are the first run's)
        │
        ▼
  invalidKeys = { "page" }
  stripped    = { sortBy: "name" }
  defaults    = { page: 1, limit: 20, sortBy: "price" }
  repaired    = { page: 1, sortBy: "name" }
                 ← the rejected "page" takes its default; the valid "sortBy" is kept
        │
        ▼
  schema.validate({ page: 1, sortBy: "name" })
  → { value: { page: 1, sortBy: "name" } }
        │
        ▼
  result      = { page: 1, limit: 20, sortBy: "name" }
                 ← the schema's output, over the rest of the defaults
```

### URL→State and State→URL: single validation point

The `forwardState` interceptor handles both navigation directions:

```
URL → State:
  Browser URL parsed → decodeParams → core forwardState
  → [forwardState interceptor: schema validates]
  → core merges the route's defaults under the result
  → State committed

State → URL:
  navigate(name, params, search) → core forwardState
  → [forwardState interceptor: schema validates whichever channel holds the query]
  → core merges the route's defaults under the result
  → encodeParams → URL built
```

Schema sees deserialized objects, not raw query strings. `z.number().positive()` validates the number `2`, not the string `"2"`.

### buildPath is governed by schema validation

`router.buildPath()` runs the `forwardState` chain on the caller's intent — the one this plugin registers. It registers no `buildPath` hook and needs none:

```
router.navigate("search", {}, { page: "bad" })
  → forwardState interceptor → schema rejects page → page=1 restored, validated again
  → URL built with page=1  ✓

router.buildPath("search", {}, { page: "bad" })
  → forwardState interceptor chain, on the caller's intent  ← the schema runs here
  → route defaults merge UNDER the validated value
  → URL built with the schema's answer
```

`router.buildPath` runs the `forwardState` seam on the caller's intent, so the schema governs the href exactly as it governs `navigate`. One intent produces one URL.

⚠ **The coverage is core's, not this plugin's**: no line of this package registers a `buildPath` hook, and none needs to. *"`buildPath` is a pure URL builder; validation is a navigation-time concern"* holds only while the builder prints what navigation prints — with a route `defaultSearch` it does not, and a builder that prints a different URL is not one anyone can use. That divergence is the invariant "href equals destination" of core's `INVARIANTS.md`.

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
        └── #removeChangesSubscription()
              └── TREE_CHANGED unsubscribe, a no-op in production — cannot throw
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

### Dev-time defaultSearch validation (constructor + TREE_CHANGED)

In development mode only, the plugin validates that each route's `defaultSearch` passes its own `searchSchema`. This catches configuration mismatches early — before any navigation happens.

**At constructor time** — existing routes:

```
constructor()
        │
        └── #validateExistingDefaultParams()
              ├── mode !== "development"? → skip
              │
              └── #walkTree(pluginApi.getTree())
                    │
                    └── for each node with fullName:
                          #validateSingleRouteDefaultSearch(node.fullName)
                            │
                            ├── no schema for route? → skip
                            ├── no defaultSearch? → skip
                            ├── schema.validate(defaultSearch) returns Promise? → skip
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
              │     full dotted names) → #validateSingleRouteDefaultSearch(route.name)
              ├── op "update": if event.patch.defaultSearch is set
              │     → #validateSingleRouteDefaultSearch(event.name)
              └── op "remove" / "clear": no-op (routes gone)
                    (same single-route check as above)
```

### Runtime schema validation (forwardState interceptor)

On every navigation, `#validate` calls `schema["~standard"].validate(channel)`, once more on each text copy while the latest run rejects a number or a boolean not tried before, once more on the query the runs settle on when the text fixed some of the keys it tried and not the others, and after the issues left `#repair` calls it on the repaired query. The Standard Schema V1 contract guarantees:

- **Success:** returns `{ value: Output }` — typed, coerced, transformed output
- **Failure:** returns `{ issues: readonly StandardSchemaV1Issue[] }` — array of validation problems
- **Async:** returns a `Promise` — thrown immediately (synchronous pipeline only)

Issues with a `path` array contribute to key-level stripping via `getInvalidKeys`. Issues without a path (object-level failures) do not produce strippable keys — the whole param set passes through the strip step unchanged for those issues.

## Error Recovery Strategy

Recovery applies only when `onError` is not set, to the query the text runs settle on and the schema's issues on it: a key whose text passed is text there, every other key as decoded. The sequence is:

```
1. getInvalidKeys(issues)
      └── for each issue with issue.path.length > 0:
            extract issue.path[0] as string key
            → Set<string> of invalid top-level keys

2. omitKeys(channel, invalidKeys)
      └── shallow copy of the validated channel without invalid keys
          → "stripped" params

3. { ...pickKeys(defaults, invalidKeys), ...stripped }
      └── each rejected key takes its `defaultSearch` value, or is dropped
          → the "repaired" query

4. schema["~standard"].validate(repaired)
      ├── value  → { ...defaults, ...output }   (output over `repaired`; alone under strict)
      └── issues → { ...defaults, ...stripped } (no output to write: as built)
          → written back to the channel each key came from
```

So a repaired query the schema accepts comes back as the schema outputs it, and one it still rejects as built — a key the text fixed as its text. The repair's run happens only when issues are left.

**Mode behavior:**

| Scenario                        | `console.error`       | Repair (strip, restore, validate again) |
| ------------------------------- | --------------------- | --------------------------------------- |
| `mode: "development"` (default) | Yes — before strip    | Yes                                     |
| `mode: "production"`            | No                    | Yes                                     |
| `onError` set (any mode)        | No — callback owns it | No — callback owns it                   |

The text runs come first in every row, so a query the text fixes reaches neither `console.error`, the repair nor `onError`.

**`onError` contract:**

- Receives: `(routeName: string, params: Params, issues: readonly StandardSchemaV1Issue[])` — called after the text runs, only when issues are left: `params` holds each key the text fixed as text and every other key as decoded, and `issues` are the schema's own on those `params`
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
| Second validation only after issues                | `plugin.ts`  | A query the schema accepts runs it once                                      |
| Text run only for a rejected number or boolean     | `helpers.ts` | `readAsText` reads the values the issues name, not the whole query, and copies the query only when one of them is a number or a boolean not tried before; otherwise no run — `decoded-text-retry-2725.test.ts` records what each run is handed |
| The settled query runs unless it is the first or the last | `plugin.ts`  | Its issues are the first run's when every key tried goes back as decoded and the last run's when none does; it gets a run of its own only when the text fixed some keys and not the others, and with a staged schema that run can repeat a round's — `decoded-text-retry-2725.test.ts` records what each run is handed |
| Development report linear in the issues            | `report.ts`  | The text issues are grouped by key once, and a tried element is checked against a `Set` of the places they name; each issue is read a fixed number of times — `decoded-text-retry-2725.test.ts` counts the reads |
| Dev-time defaultSearch check skipped in production | `plugin.ts`  | Tree walk gated on `mode !== "development"`; the TREE_CHANGED subscription is not registered at all in production |

## Related Documents

- [ARCHITECTURE.md](../../ARCHITECTURE.md) — System architecture of the monorepo
- [core/ARCHITECTURE.md](../core/ARCHITECTURE.md) — Core architecture (Plugin API, forwardState interceptor, addInterceptor)
- [persistent-params-plugin/ARCHITECTURE.md](../persistent-params-plugin/ARCHITECTURE.md) — Example of a stateful plugin using the same interceptor pattern
- [INVARIANTS.md](INVARIANTS.md) — Property-based test invariants
