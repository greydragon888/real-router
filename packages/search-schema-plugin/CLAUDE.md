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

### Async schemas throw immediately

If `~standard.validate()` returns a Promise, the plugin throws `TypeError`. This is by design — `forwardState` is synchronous.

### `strict: true` interaction with Zod

Zod strip mode (default) removes unknown keys from output. With `strict: true`, the plugin uses `validation.value` directly (unknowns gone). With `strict: false`, it merges `{ ...original, ...validation.value }` (unknowns preserved from original).

### Dev-time defaultParams check

At `usePlugin()` time, validates all existing routes' `defaultParams` against their `searchSchema`. Runtime tree mutations are then re-validated via the `TREE_CHANGED` subscription: `add`/`replace` validate the whole added subtree (flat, full dotted names), and `update` re-validates the route when its `defaultParams` change. `remove`/`clear` are no-ops (routes gone). Production mode skips all of this (no subscription registered).

## See Also

- [RFC](../core/.claude/rfc/rfc-search-schema-validation.md) — Full design document
- [packages/core/CLAUDE.md](../core/CLAUDE.md) — Core package (PluginApi, forwardState interceptor)
- [packages/persistent-params-plugin/CLAUDE.md](../persistent-params-plugin/CLAUDE.md) — Similar interceptor pattern
