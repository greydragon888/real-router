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
3. `forwardState` interceptor: `next()` → schema validate → a rejected number or boolean is tried once more as its text, `String(value)`, and again for each one a staged schema names next → on the issues left: strip the rejected keys → restore their `defaultSearch` values → validate the repaired query once more
4. `TREE_CHANGED` listener: re-validates `defaultSearch` on `add` / `replace` (whole added subtree) and `update` (when `defaultSearch` changed) — dev mode only. A tree-change subscription sees `update` and `replace`, which an `add` interceptor would not
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
├── helpers.ts    — getInvalidKeys / issueKey / namesOneOf / segmentKey (the keys issues name), isNumberOrBoolean (the two types the router decodes from text), readAsText (the query with each rejected number or boolean as its text), omitKeys (shallow copy without keys), pickKeys (shallow copy of only those keys), collectPathParams (the path-slot names in a route's URL)
├── report.ts     — describeRejection: the mode "development" console.error message
├── validation.ts — validateOptions: mode / strict / onError, TypeError at factory time
├── types.ts      — StandardSchemaV1 types (inline), SearchSchemaPluginOptions
├── constants.ts  — ERROR_PREFIX
└── index.ts      — Public exports + Route module augmentation
```

## Gotchas

### Schema validates application-level data, not URL strings

Schema runs after `decodeParams` (URL→State) and before `encodeParams` (State→URL). It sees deserialized objects, not raw query strings. `z.number().positive()` validates the number `2`, not the string `"2"`.

A number or boolean the schema rejects — a key's value or an array element — is tried once more as its text, `String(value)`, which under `"auto"` is the text the URL holds; a key whose text passes keeps it (`decoded-text-retry-2725.test.ts`). A staged schema — a discriminated union, a refinement that runs once the object parses — names a number only once another value is text, so a run follows for each value it names next, and no value is tried twice. So a `z.string()` field settles `?q=17` as `{ q: "17" }` under every format — unless only the repair's run rejects the number, which is not tried as text: a discriminated union whose discriminator the URL leaves to `defaultSearch` names nothing else before the repair. What the runs settle on is a query with each key the text fixed as text and every other key as decoded, and the issues the dev message, `onError` and the repair go by are the schema's on that query: a check a type issue stops, as a zod refinement is, can reject the decoded query and never run on its text, or the reverse — and the repair is one pass, so a key only such a check rejects can stay in the state. On one navigation or `buildPath()` the schema runs first, once per round of texts — one round for a schema that reports every issue at once, a round per value for one that stops at its first issue — once more on the settled query when the text fixed some of the keys it tried and not the others, and once more in the repair.

### `buildPath` IS governed, through the seam this plugin already hooks

`router.buildPath()` runs the `forwardState` chain on the caller's intent (core #2087), so a standalone call is validated exactly as `navigate` is. No `buildPath` hook is needed here, and none should be added.

### `.default()` fills before `defaultSearch` does

The schema runs on what `next()` returns: the caller's channels plus any `forwardTo` hop's defaults — not the route's own `defaultSearch`, which core merges under the result afterwards (at `canonicalize`). So `z.number().default(1)` fires whenever the caller omits the key, and the value it produces is caller-side from core's point of view: `defaultSearch` merges under it. The repair's run is handed, of the route's defaults, only the rejected keys' own — so there too an absent key takes `.default()` ahead of its `defaultSearch` value.

### `onError` bypasses the built-in recovery, not the text runs

When `onError` is set, the plugin does NOT call `console.error`, strip params or run the repair. The text runs come first: `onError` is called only when issues are left, with the query they settle on — each key the text fixed as text, every other key as decoded — and the schema's own issues on that query (the property `onError is handed a query and the schema's own issues on it`). It must return clean params. No re-validation of returned params (avoids infinite loops).

### Path-less validation issues (cross-field `refine`) can't be stripped by key

The strip-and-recover path removes only the keys a validation issue **names** in its `path` — `getInvalidKeys` (`helpers.ts`) skips any issue whose `path` is empty (an issue with no path concerns the whole object, not one key). So a **cross-field** `.refine()` / `.superRefine()` that reports a **path-less** issue strips **nothing**: `invalidKeys` is empty → `omitKeys` is a no-op → the repair's run rejects the same query → the invalid combination passes into `state` unrepaired, a number the text fixed as its text and every other value as decoded. In `mode: "development"` a `console.error` is still logged; `mode: "production"` is **silent**.

```typescript
const schema = z
  .object({ min: z.number(), max: z.number() })
  .refine((v) => v.min < v.max, { message: "min must be < max" }); // no `path`
await router.navigate("range", {}, { min: 10, max: 5 }); // min/max are query-declared (?min&max)
router.getState().search; // { min: 10, max: 5 } — NOT stripped
```

So the "validate → strip → restore → validate again" contract holds **per key**; it cannot recover a rule class for which strip-by-key is structurally impossible. To recover from a cross-field failure, give the refine a `path` (`{ message, path: ["max"] }`) so the offending key is stripped and its default restored, or handle it in `onError` (which sees the path-less issue). A whole-object reset on a path-less failure is not built in — add it via `onError` if you need it.

### Async schemas throw immediately

If `~standard.validate()` returns a Promise, the plugin throws `TypeError`. This is by design — `forwardState` is synchronous.

### A schema that throws on a restored default or on a text refuses the navigation

A rejected key's `defaultSearch` value goes through the repair's run, and every run after the first can hold the text of a rejected number or boolean — the repair's included, since it keeps each key the text fixed that no issue on the query the runs settle on names. So a schema that throws on either refuses the navigation, and `buildPath()` throws: a callback that assumes a string, handed a numeric default (`repair-path-schema-output-2824.test.ts`); a transform or a refinement that assumes a URL, handed `"17"` on a text run or on the repaired query; a refinement a type issue kept away from the decoded query, reached once a key is text (`decoded-text-retry-2725.test.ts`). zod hands such a throw back as a rejected Promise, which the plugin refuses as an async schema — as it refuses an async refinement the text reaches. The refusal comes before `onError`, which is called only once the text runs leave issues.

### A key without a value under `booleanFormat: "empty-true"` is kept as `"true"`

Under `"empty-true"` the router decodes `?q` to `true`, so a `z.string()` field keeps its text `"true"`, and the URL then prints `?q=true`. Declare the field `z.boolean()` to read it as a flag. Under the default formats `?q` decodes to `null`, which is never tried as text.

### A query key named after an `Object.prototype` member is unsupported

The schema is handed a plain object, so a field named `constructor` or `toString` reads the inherited member when the query leaves the key out. zod rejects that value, and the query is written back without the schema's output.

### `strict: true` interaction with Zod

Zod strip mode (default) removes unknown keys from output. With `strict: true`, the plugin uses `validation.value` directly (unknowns gone). With `strict: false`, it merges `{ ...original, ...validation.value }` (unknowns preserved from original). A repair is held to the same rule, with the repaired query as the original; a repaired query the schema still rejects has no output, so `strict` removes nothing from it.

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

> **The recommended order governs the query channel, the href and `state.path`.** (#1231, #1563, #1564, #2087)
>
> - **What the schema is handed is the QUERY CHANNEL, on both directions (#1564).** The interceptor subtracts the route's PATH slots from the params bag and merges `result.search` over the rest — derived, never picked by call shape — so the schema sees a v1 single-bag caller's query, the explicit `search` argument, AND whatever an inner interceptor injected (persistent-params, #1563) — while a path slot is never shown to it, never rewritten, and never dropped by `strict`. So in the recommended order the persisted values ARE validated on both directions.
> - **The href is governed, and so is `state.path`.** `router.buildPath` runs the `forwardState` seam (core #2087), so this plugin reaches the href without hooking anything new — and `persistent-params-plugin` injects on that same seam and nowhere else, so a stored value this schema rejects — a number or a boolean once its text is rejected too — reaches neither the printed URL nor `state.search`. That plugin's `schema-governs-the-href-1938` pins it from the other side, with a CONTROL cell showing an ACCEPTED value still riding through. (Do **not** add a `buildPath` hook here: the seam this plugin already registers covers the door.)
> - **A route default is NOT a mitigation.** An injected persistent value is the caller-side value from core's point of view, and every route default (`defaultSearch`, `defaultParams`) merges strictly **under** it — verified: `persistentParamsPluginFactory({ page: "bogus" })` commits `page=bogus` on a route declaring `defaultSearch: { page: "1" }`.

### Dev-time defaultSearch check

At `usePlugin()` time, validates all existing routes' `defaultSearch` against their `searchSchema` (the query-channel default is what the schema governs; `defaultParams` is the path/arbitrary channel since #1549). Runtime tree mutations are then re-validated via the `TREE_CHANGED` subscription: `add`/`replace` validate the whole added subtree (flat, full dotted names), and `update` re-validates the route when its `defaultSearch` changes. `remove`/`clear` are no-ops (routes gone). Production mode skips all of this (no subscription registered).

### Invalid `defaultSearch` reaches state at runtime — core-injected, plugin cannot gate (#802)

The runtime guarantee ("invalid params never reach `state`") holds for **user input** only. `defaultSearch` (and `defaultParams`) are **developer config** merged in by **core**, at layers _below_ the `forwardState` interceptor this plugin hooks — so an invalid default reaches state (`state.search` for a `defaultSearch` value, `state.params` for a `defaultParams` one — core routes defaults by channel since #1549), `state.path`, `router.buildPath()`, and `isActiveRoute()` comparisons, on every navigation, in every `mode`. The plugin **cannot** strip it from `forwardState`: whatever it returns, core re-applies the defaults afterwards — `canonicalize` (`packages/core/src/pipeline/canonicalize.ts`) merges them under the interceptor's result, below the seam and out of an interceptor's reach (`InterceptableMethodMap` = `start` / `forwardState`; only `forwardState` is hooked). The re-application always lets caller values win, so an interceptor can add or replace a key but cannot **remove** one core will re-fill from config.

Consequence: the `...defaults` merge that ends `#repair` is **redundant with core's own merge** on the navigate/start/`buildPath` paths — but a direct `PluginApi.forwardState` call skips that merge, so **do not delete it** (`repair-path-schema-output-2824.test.ts` pins it there, on both outcomes of the repair's run). A rejected key's own default goes through that run, and an invalid one still lands: it fails the run, and the outer merge puts it back as written. The dev-time check above is a **config lint**, not a runtime gate. Documented limitation, not a plugin bug — a runtime fix would require core changes. Priority-low, no user report; the plugin's honest contract is "invalid _input_ never reaches state".

Known gap (#802 side-finding): swapping `searchSchema` via `getRoutesApi(router).update(name, { searchSchema })` emits **no** `TREE_CHANGED` (custom fields aren't in `buildStructuralPatch` — only `forwardTo` / `defaultParams` / `defaultSearch` / `encodeParams` / `decodeParams`), so the dev check does **not** re-validate existing `defaultSearch` against a newly-swapped schema.

## See Also

- RFC: `packages/core/.claude/rfc/rfc-search-schema-validation.md` — full design document, a local file git does not track
- [packages/core/CLAUDE.md](../core/CLAUDE.md) — Core package (PluginApi, forwardState interceptor)
- [packages/persistent-params-plugin/CLAUDE.md](../persistent-params-plugin/CLAUDE.md) — Similar interceptor pattern
