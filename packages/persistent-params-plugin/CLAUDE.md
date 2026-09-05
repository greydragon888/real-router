# @real-router/persistent-params-plugin

> Persists query parameters across all navigation transitions via a `forwardState` interceptor

## Configuration

```typescript
// Array: param names, initial values are undefined
persistentParamsPluginFactory(["lang", "theme"])

// Object: param names with default values
persistentParamsPluginFactory({ lang: "en", theme: "light" })
```

**Allowed value types:** `string`, `number`, `boolean`, `undefined` (to remove).

`null`, arrays, and objects throw `TypeError` at navigation time. `NaN` and `Infinity` are also rejected (via `isPrimitiveValue` from `type-guards`).

Empty config (`{}` or `[]`) returns a no-op `PluginFactory` — no interceptor registered, no root path change.

Validation runs at factory call time (param names) and again at navigation time (param values).

**Invalid param name characters:** `= & ? # % / \ ` and whitespace. Validated via regex in `validateParamKey`.

## Navigation Flow

```
navigate(name, params, search)  →  core buildNavigateState (synchronous):
  → forwardState interceptor
      → next(routeName, routeParams, routeSearch) ← get base state; both channels forwarded untouched
      → #forwardStateSearch(result.search, result.params) ← inject persistent into the QUERY channel;
                                                             honour removals from EITHER channel

router.buildPath(name, params, search)  →  the SAME seam, on the caller's intent (core #2087)

onTransitionSuccess(toState)   ← only fires if the transition actually committed
  → reads toState.search for each tracked key (canonical); falls back to toState.params
    for a hand-built state committed via navigateToState
  → updates #persistentParams snapshot; COMMITS removals (deletes from snapshot + #paramNamesSet)
  → claim.write(toState, #persistentParams)   ← publishes to state.context.persistentParams
```

**One seam, both doors.** `#forwardStateSearch` runs on the navigate path and on `router.buildPath` alike (core #2087), so the query it returns is the one the state carries **and** the one the URL prints. There is no second injection point to keep in step, which is what makes the href a `<Link>` renders the URL a click commits.

- `extractOwnParams` on both bags → `mergeParams` into the query channel, which honors `undefined` as a delete for this transition.
- A removal request is honored in **either** channel. In `search` — the canonical form — `mergeParams` applies it directly. A tracked key spelled `undefined` in the path bag is honored too, because core reads a declared query name there as a channel error only when it carries a VALUE.
- The tracked set and the snapshot are **not** mutated here: that would drop the param before the deactivation/activation guards run, so a rejected or cancelled transition would lose it (#803). The permanent removal is committed in `onTransitionSuccess`.

**The interceptor writes the query channel only (#1563).** Persistent params are QUERY params by the plugin's own declaration (`setRootPath("?a&b")`), so their values belong in `search`; the path bag is handed on untouched and core has nothing to re-route. Two consequences:

- A single-bag `router.buildPath(name, params)` — what an adapter `<Link>` makes — prints the injected values because the seam RETURNS them in the query channel, not because the caller's params bag is read as a query source.
- On a route that declares `defaultSearch`, core's `search` channel is defined even for a single-bag call. Injecting into `search` is what keeps `buildPath` and `navigate` on one answer.

⚠ **The legacy single-bag form is gone (#1572).** A key the route declares with `?name` passed in the path bag now throws a `TypeError` from `navigate` / `makeState` / `buildNavigationState` — tracked values ride the `search` argument: `navigate("page", {}, { lang: "fr" })`. In the query channel the caller's value wins over the stored one; a declared query name in the path bag is ignored, exactly as core ignores it, so the href prints the stored value rather than one `navigate` refuses. (An UNDECLARED tracked key is unaffected: the guard only fires on declared query names.)

**Permanent removal happens in `onTransitionSuccess`, not in the interceptor** — keyed on the committed state, so a rejected/cancelled navigation never drops the param (#803).

## State Context

The plugin publishes a read-only snapshot of current persistent params to `state.context.persistentParams` via the claim-based State Context API.

- **Claim:** `api.claimContextNamespace("persistentParams")` in the constructor. Returns `{ write, release }`.
- **Write:** `claim.write(toState, #persistentParams)` called at the end of `onTransitionSuccess`, after the internal snapshot is updated. Runs before subscriber callbacks, so `router.subscribe()` listeners always see the latest values.
- **Release:** `claim.release()` called in `teardown`, before the `setRootPath` restore.
- **Type:** Module augmentation on `@real-router/core/types` adds `persistentParams?: Params` to `StateContext`.

Components can use `state.context.persistentParams` to distinguish persistent (query) params from route-specific (path) params in `state.params`. Post-RFC-4-M2 (#1548) the two normally live in different channels — persistent params in `state.search`, route path params in `state.params` — so `state.context.persistentParams` gives a stable, channel-independent read regardless of which bag a value currently rides in (see the `onTransitionSuccess` gotcha below for the one case — a hand-built state committed via `navigateToState` — where a persisted value can still ride in `state.params`).

## Gotchas

### Parameter removal is permanent — but only once the removal commits

Passing `undefined` for a tracked param deletes it from `paramNamesSet` and from `#persistentParams`. It won't be re-persisted even if you pass it again later:

```typescript
router.navigate("page", {}, { lang: undefined });           // lang removed once this navigation commits
router.navigate("page", { lang: undefined });              // same request, spelled in the path bag
router.navigate("page", {}, { lang: "en" });               // lang NOT re-added — Set no longer tracks it
```

Once removed, the param is gone for the lifetime of the plugin instance.

**The removal is committed in `onTransitionSuccess`, not in the interceptor (#803).** If the removal navigation is rejected by a guard or superseded by a concurrent navigate, it never reaches `onTransitionSuccess`, so the param stays persisted — the drop is not permanent until the transition actually commits. Within the current transition the param is absent from the built state (`state.search` — the channel it lives in) and from `state.path`, both of which the one seam produces; it is only re-persisted for **later** navigations when the removal did not commit.

### `setRootPath` throws during `router.dispose()`

Teardown calls `setRootPath(originalRootPath)` to restore the root path. When called from `router.dispose()`, the FSM is already in `DISPOSED` state, so `setRootPath`'s internal `throwIfDisposed()` throws. The teardown wraps only this call in try/catch and swallows the error silently — restoring root path on a destroyed router is a no-op anyway.

Interceptor removal (`#removeForwardStateInterceptor`) and `claim.release()` are called unconditionally before the try/catch.

### Rollback on partial initialization failure

The constructor registers side effects in order: `setRootPath` → `addInterceptor("forwardState")`. If either step throws, the catch block calls the already-registered unsubscriber and restores the original root path before re-throwing. This path is marked `/* v8 ignore */` — it can't be triggered in normal usage.

### `initialParams` is frozen and shared across closures

`Object.freeze(initialParams)` runs in the factory before the `PluginFactory` closure captures it. The plugin constructor receives this frozen object as `persistentParams`. The plugin never mutates `initialParams` directly — when params change, it creates a new frozen object and reassigns `#persistentParams`. Safe to share.

### `paramNamesSet` is cloned per router instance

The factory creates one `paramNamesSet` from the config. Each `PluginFactory` invocation passes `new Set(paramNamesSet)` to the constructor. This prevents cross-router mutation: if two routers use the same factory result, removing a param on one doesn't affect the other.

### `mergeParams` does NOT self-sanitize

`mergeParams(persistent, current)` assumes `current` is already sanitized. The caller (`#forwardStateSearch`) must call `extractOwnParams` first. If you call `mergeParams` directly with an unsanitized object, inherited properties will leak through.

### `onTransitionSuccess` — secondary sync for injection, PRIMARY for removal

The primary param **injection** happens in the interceptor. `onTransitionSuccess` updates `#persistentParams` to reflect what actually committed. For **removal**, though, it is the primary site (#803): a tracked key that is missing or `undefined` in the committed state (checked in `toState.search` first — the canonical channel post-M2 / #1548 — falling back to `toState.params` for a `makeState`-built state) is deleted from **both** `#persistentParams` and `#paramNamesSet` here — covering the explicit `navigate({ key: undefined })` removal (mergeParams dropped it for this transition) and the defensive `navigateToState` bypass (which skips the `forwardState` injection) with the same branch. Only a key that was really persisted (present with a defined value) is removed; a still-empty tracked key stays tracked so it can persist later.

⚠ **A committed `UNKNOWN_ROUTE` state is exempt (#1676)** — it returns early, publishing the unchanged snapshot and accounting no removal. Core hand-builds the 404 with **both channels empty** (the path matched no route, so no route declares where its keys belong) while keeping the `path` that still carries the query, so absence there is a property of the 404 state, not a request. Without the exemption every channel that commits one retired the key for the router's remaining life: `start()` on an unmatched path (dead before the app's first navigation), a popstate onto a dead link, and `replace()` dropping the active route — the last broke the persistent-params e2e of all six `combined` examples (#1674).

After updating the snapshot, `onTransitionSuccess` publishes it to `state.context.persistentParams` via `claim.write(toState, #persistentParams)`. This happens before subscriber callbacks fire, so `router.subscribe()` listeners always see the current persistent params snapshot on `state.context.persistentParams`.

### Double initialization throws

`usePlugin` is called once per router. Calling it twice with the same factory (without `unsubscribe()` in between) throws from core: the second instance's `claimContextNamespace("persistentParams")` hits the already-claimed namespace (`CONTEXT_NAMESPACE_ALREADY_CLAIMED`). The plugin itself adds no explicit guard — the core namespace-claim collision is the backstop. (With `@real-router/validation-plugin`, the duplicate **factory** is rejected even earlier, before the factory runs — #726.)

### Composition order with `search-schema-plugin` decides whether persistent params are validated

This plugin's `forwardState` interceptor **injects** persistent params into the target state (it wraps `next()` and **fills in absent keys** — incoming params win over the stored ones). `@real-router/search-schema-plugin` also registers a `forwardState` interceptor, and it **validates** the result of its `next()`. Because core composes interceptors **LIFO** (last-registered = outermost), whichever plugin is registered **last** wraps the other — so registration order decides whether the injected persistent params pass through the schema:

```typescript
// RECOMMENDED — persistent-params first, search-schema second:
router.usePlugin(persistentParamsPluginFactory({ page: 1 }));
router.usePlugin(searchSchemaPlugin());
// search-schema is outermost → it sees what this plugin injected
// → an invalid persisted value is reported/stripped by the schema

// ALTERNATIVE — persistent-params second (this plugin outermost):
router.usePlugin(searchSchemaPlugin());
router.usePlugin(persistentParamsPluginFactory({ page: 1 }));
// this plugin injects AFTER the schema ran → persistent params bypass validation
```

Register this plugin **before** `search-schema-plugin` if you want persistent params validated by the schema (the safer default); register it after only when they must deliberately skip validation. This is a pure ordering choice — no code change, LIFO is working as documented. (`search-schema-plugin`'s CLAUDE.md and README carry the mirror note. #801)

> **The order decides validation, and it now decides it everywhere.** (#1231, #1563, #1564, #2087)
>
> - **Both directions ARE validated (since #1564).** `search-schema-plugin` no longer picks a bag by call shape: it validates the route's whole query channel — the explicit `search` argument, a v1 single-bag caller's query, and this plugin's injection — on `navigate` and on the URL→State direction alike. (Before #1564 it read the params bag on `navigate`, so the persisted values were seen on exactly one direction, and which one flipped with #1563.)
> - **One seam, so one answer.** This plugin injects at `forwardState` and nowhere else; `search-schema-plugin` validates the result of that same seam, and `router.buildPath` runs it (core #2087). A stored value the schema rejects therefore reaches neither `state.search` nor the printed URL — pinned by `schema-governs-the-href-1938`, whose CONTROL cell shows an ACCEPTED value still riding through, so the first assertion is not satisfied by a plugin that injects nothing. (The #802 "injection channels below the validation seam" class had its second exhibit here; the `defaultSearch` one below is the remaining one.)
> - **A route default is NOT a mitigation.** An injected persistent value is the caller-side value from core's point of view, and every route default (`defaultSearch`, `defaultParams`) merges strictly **under** it — verified: a plugin configured `{ page: "bogus" }` commits `page=bogus` on a route declaring `defaultSearch: { page: "1" }`. What keeps the leak small is the capture rule: persisted values are taken from committed states, and the plugin's own `validateParamValue` rejects non-primitives on the way in.

## Module Structure

```
src/
├── factory.ts      — persistentParamsPluginFactory: validates config, builds initialParams,
│                     clones paramNamesSet, returns PluginFactory closure
├── plugin.ts       — PersistentParamsPlugin class: registers the forwardState interceptor,
│                     claims "persistentParams" context namespace,
│                     exposes getPlugin() returning { onTransitionSuccess, teardown }
├── param-utils.ts  — extractOwnParams (own-keys-only copy), mergeParams (merge logic)
├── validation.ts   — validateConfig (factory-time; refuses `__proto__` as a param
│                     name, #1810), validateParamValue (nav-time),
│                     isValidParamsConfig, validateParamKey
├── types.ts        — PersistentParamsConfig = string[] | Record<string, string|number|boolean>
├── constants.ts    — ERROR_PREFIX, LOGGER_CONTEXT
└── index.ts        — Public exports: persistentParamsPluginFactory, PersistentParamsConfig
                      Module augmentation: declares StateContext.persistentParams on @real-router/core/types
```

Module augmentation in `index.ts` extends `@real-router/core/types` `StateContext` with `persistentParams?: Params`. This provides typed access to `state.context.persistentParams` for all consumers that import the plugin.
