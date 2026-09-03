# @real-router/search-schema-plugin

> Runtime search parameter validation via Standard Schema V1

## Exports

| Export                    | Kind     | Description                                                    |
| ------------------------- | -------- | -------------------------------------------------------------- |
| `searchSchemaPlugin`      | function | Plugin factory — pass to `router.usePlugin()`. Takes options.  |
| `SearchSchemaPluginOptions` | type   | Configuration: `mode`, `strict`, `onError`                     |
| `StandardSchemaV1`        | type     | Standard Schema V1 interface (inline, zero deps)               |
| `StandardSchemaV1Issue`   | type     | Validation issue from Standard Schema                          |
| `StandardSchemaV1Result`  | type     | Validation result (success or failure)                         |

## How It Works

1. `searchSchemaPlugin(options)` returns a `PluginFactory`
2. On `router.usePlugin()`: registers `forwardState` interceptor + (dev mode only) subscribes to `TREE_CHANGED` via `getRoutesApi(router).subscribeChanges()`
3. `forwardState` interceptor: `next()` → schema validate → strip invalid → merge defaults
4. `TREE_CHANGED` listener: re-validates `defaultParams` on `add` / `replace` (whole added subtree) and `update` (when `defaultParams` changed) — dev mode only. Replaces the old `add` interceptor, which could not see `update`/`replace`
5. Both directions (URL→State and State→URL) go through `forwardState` — single validation point

## Module Augmentation

Extends the `Route` interface with `searchSchema`, and the `RouteConfigUpdate`
interface with `searchSchema` (`| null`) so the schema is patchable via
`getRoutesApi(router).update(name, { searchSchema })` (#797) — read lazily, so
the next navigation validates against the new schema:

```typescript
declare module "@real-router/core" {
  interface Route {
    searchSchema?: StandardSchemaV1;
  }

  interface RouteConfigUpdate {
    searchSchema?: StandardSchemaV1 | null;
  }
}
```

## Module Structure

```
src/
├── factory.ts    — searchSchemaPlugin: validates options, freezes config, returns PluginFactory
├── plugin.ts     — SearchSchemaPlugin class: forwardState interceptor + TREE_CHANGED subscription, tree validation
├── helpers.ts    — getInvalidKeys (extract keys from issues), omitKeys (shallow copy without keys)
├── types.ts      — StandardSchemaV1 types (inline), SearchSchemaPluginOptions
├── constants.ts  — ERROR_PREFIX
└── index.ts      — Public exports + Route module augmentation
```

## Gotchas

### Schema validates application-level data, not URL strings

Schema runs after `decodeParams` (URL→State) and before `encodeParams` (State→URL). It sees deserialized objects, not raw query strings. `z.number().positive()` validates the number `2`, not the string `"2"`.

### `buildPath` is NOT affected by schema validation

`router.buildPath()` uses the `buildPath` interceptor chain, not `forwardState`. This plugin only hooks `forwardState` — so standalone `buildPath()` calls skip schema validation entirely. During `navigate`, the core calls `buildPath` internally with already-validated params from `forwardState`, so navigate-produced URLs are always clean.

### `defaultParams` > `.default()` priority

Core `forwardState` fills undefined params from `defaultParams` via `next()` BEFORE schema runs. So `z.number().default(1)` only fires if the param is still `undefined` after core's merge.

### `onError` bypasses all built-in error handling

When `onError` is set, the plugin does NOT call `console.error` or strip params. The callback receives raw issues and must return clean params. No re-validation of returned params (avoids infinite loops).

### Path-less validation issues (cross-field `refine`) can't be stripped by key

The strip-and-recover path removes only the keys a validation issue **names** in its `path` — `getInvalidKeys` (`helpers.ts`) skips any issue whose `path` is empty (an issue with no path concerns the whole object, not one key). So a **cross-field** `.refine()` / `.superRefine()` that reports a **path-less** issue strips **nothing**: `invalidKeys` is empty → `omitKeys` is a no-op → the invalid combination passes into `state` untouched. In `mode: "development"` a `console.error` is still logged; `mode: "production"` is **silent**.

```typescript
const schema = z
  .object({ min: z.number(), max: z.number() })
  .refine((v) => v.min < v.max, { message: "min must be < max" }); // no `path`
await router.navigate("range", {}, { min: 10, max: 5 }); // min/max are query-declared (?min&max)
router.getState().search; // { min: 10, max: 5 } — NOT stripped
```

So the "schema validate → strip invalid → merge defaults" contract holds **per key**; it cannot recover a rule class for which strip-by-key is structurally impossible. To recover from a cross-field failure, give the refine a `path` (`{ message, path: ["max"] }`) so the offending key is stripped and its default restored, or handle it in `onError` (which sees the raw issues). A whole-object reset on a path-less failure is not built in — add it via `onError` if you need it.

### Async schemas throw immediately

If `~standard.validate()` returns a Promise, the plugin throws `TypeError`. This is by design — `forwardState` is synchronous.

### `strict: true` interaction with Zod

Zod strip mode (default) removes unknown keys from output. With `strict: true`, the plugin uses `validation.value` directly (unknowns gone). With `strict: false`, it merges `{ ...original, ...validation.value }` (unknowns preserved from original).

### Composition order with `persistent-params-plugin` decides whether persistent params are validated

Both this plugin and `@real-router/persistent-params-plugin` register a `forwardState` interceptor, and core runs interceptors **LIFO** (last-registered = outermost, wraps the rest — the documented `addInterceptor` contract). This plugin's interceptor validates the result of `next()`, so it only sees what the **inner** (earlier-registered) layers produced. Registration order therefore decides whether persistent params go through the schema:

```typescript
// RECOMMENDED — persistent-params first, search-schema second (schema outermost):
router.usePlugin(persistentParamsPluginFactory({ page: 1 }));
router.usePlugin(searchSchemaPlugin());
// schema wraps persistent-params → it validates the INJECTED persistent params too
// → an invalid persisted value is stripped and its default restored

// ALTERNATIVE — search-schema first, persistent-params second (persistent outermost):
router.usePlugin(searchSchemaPlugin());
router.usePlugin(persistentParamsPluginFactory({ page: 1 }));
// persistent-params injects AFTER the schema already validated
// → persistent params BYPASS the schema and reach state unvalidated
```

Prefer the recommended order (schema outermost) so `state` is validated as a whole, persistent params included. Use the alternative only when persistent/infra params must deliberately skip schema validation ("schema doesn't touch infra params"). Both are defensible, but the two are **not** interchangeable: swapping the `usePlugin` lines silently flips whether persistent params are validated. (`persistent-params-plugin`'s CLAUDE.md carries the mirror note.)

> **Caveat — the recommended order still never reaches `state.path`.** (#1231, #1563, #1564)
>
> - **What the schema is handed is the QUERY CHANNEL, on both directions (#1564).** The interceptor no longer picks a bag by call shape: it subtracts the route's PATH slots from the params bag and merges `result.search` over the rest, so the schema sees a v1 single-bag caller's query, the explicit `search` argument, AND whatever an inner interceptor injected (persistent-params since #1563) — while a path slot is never shown to it, never rewritten, and never dropped by `strict`. So in the recommended order the persisted values ARE validated on both directions.
> - **`state.path` is out of reach.** `persistent-params-plugin` registers **two** interceptors — `forwardState` (injects into the state's query channel) **and** `buildPath` (injects into the query the URL is built from) — but this plugin hooks **only** `forwardState`. So the `buildPath` channel is structurally out of its reach: an invalid persisted value still reaches `state.path` (persistent, reload-stable), and no registration order fixes it. (Same #802 "injection channels below the validation seam" class as the `defaultParams` gap above; do **not** add a `buildPath` hook here — it breaks the documented standalone-`buildPath` bypass.)
> - **A route default is NOT a mitigation.** An injected persistent value is the caller-side value from core's point of view, and every route default (`defaultSearch`, `defaultParams`) merges strictly **under** it — verified: `persistentParamsPluginFactory({ page: "bogus" })` commits `page=bogus` on a route declaring `defaultSearch: { page: "1" }`.

### Dev-time defaultSearch check

At `usePlugin()` time, validates all existing routes' `defaultSearch` against their `searchSchema` (the query-channel default is what the schema governs; `defaultParams` is the path/arbitrary channel since #1549). Runtime tree mutations are then re-validated via the `TREE_CHANGED` subscription: `add`/`replace` validate the whole added subtree (flat, full dotted names), and `update` re-validates the route when its `defaultSearch` changes. `remove`/`clear` are no-ops (routes gone). Production mode skips all of this (no subscription registered).

### Invalid `defaultSearch` reaches state at runtime — core-injected, plugin cannot gate (#802)

The runtime guarantee ("invalid params never reach `state`") holds for **user input** only. `defaultSearch` (and `defaultParams`) are **developer config** merged in by **core**, at layers _below_ the `forwardState` interceptor this plugin hooks — so an invalid default reaches state (`state.search` for a `defaultSearch` value, `state.params` for a `defaultParams` one — core routes defaults by channel since #1549), `state.path`, `router.buildPath()`, and `isActiveRoute()` comparisons, on every navigation, in every `mode`. The plugin **cannot** strip it from `forwardState`: whatever it returns, core re-applies the defaults afterwards in three uninterceptable spots — `StateNamespace.makeState` (channel-aware since #1549), `RoutesNamespace.buildPath`, `RoutesNamespace.isActiveRoute` (`InterceptableMethodMap` = `start` / `buildPath` / `forwardState`; only `forwardState` is hooked). The re-application always lets caller values win, so an interceptor can add or replace a key but cannot **remove** one core will re-fill from config.

Consequence: the restore branch `{ ...defaults, ...stripped }` in `#validateState` is **redundant with `makeState`'s merge** on the navigate/start paths — but it still matters for `PluginApi.buildState` / `forwardState` consumers (which skip `makeState`), so **do not delete it**. The dev-time check above is a **config lint**, not a runtime gate. Documented limitation, not a plugin bug — a runtime fix would require core changes (single-merge-point refactor; see the #802 analysis). Priority-low, no user report; the plugin's honest contract is "invalid _input_ never reaches state".

Known gap (#802 side-finding): swapping `searchSchema` via `getRoutesApi(router).update(name, { searchSchema })` emits **no** `TREE_CHANGED` (custom fields aren't in `buildStructuralPatch` — only `forwardTo` / `defaultParams` / `defaultSearch` / `encodeParams` / `decodeParams`), so the dev check does **not** re-validate existing `defaultSearch` against a newly-swapped schema.

## See Also

- [RFC](../core/.claude/rfc/rfc-search-schema-validation.md) — Full design document
- [packages/core/CLAUDE.md](../core/CLAUDE.md) — Core package (PluginApi, forwardState interceptor)
- [packages/persistent-params-plugin/CLAUDE.md](../persistent-params-plugin/CLAUDE.md) — Similar interceptor pattern
