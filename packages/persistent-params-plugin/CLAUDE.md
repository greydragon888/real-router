# @real-router/persistent-params-plugin

> Persists query parameters across all navigation transitions via interceptors

## Configuration

```typescript
// Array: param names, initial values are undefined
persistentParamsPluginFactory(["lang", "theme"])

// Object: param names with default values
persistentParamsPluginFactory({ lang: "en", theme: "light" })
```

**Allowed value types:** `string`, `number`, `boolean`, `undefined` (to remove).

`null`, arrays, and objects throw `TypeError` at navigation time. `NaN` and `Infinity` are also rejected (via `isPrimitiveValue` from `type-guards`).

Empty config (`{}` or `[]`) returns a no-op `PluginFactory` — no interceptors registered, no root path change.

Validation runs at factory call time (param names) and again at navigation time (param values).

**Invalid param name characters:** `= & ? # % / \ ` and whitespace. Validated via regex in `validateParamKey`.

## Navigation Flow

```
navigate(name, params, search)  →  core buildNavigateState (synchronous):
  → forwardState interceptor
      → next(routeName, routeParams, routeSearch) ← get base state; routeSearch forwarded untouched
      → #forwardStateParams(result.params)  ← inject persistent into the path bag; RECORD removals (#pendingRemovals)
  → buildPath interceptor
      → #buildPathParams(navParams or navSearch) ← inject persistent into whichever channel the caller supplied; DROP #pendingRemovals from URL; clear
      → next(route, mergedParams[, mergedSearch])

onTransitionSuccess(toState)   ← only fires if the transition actually committed
  → reads toState.search for each tracked key (canonical); falls back to toState.params
    for a makeState-built state (start()/navigateToState — not yet slot-shifted)
  → updates #persistentParams snapshot; COMMITS removals (deletes from snapshot + #paramNamesSet)
  → claim.write(toState, #persistentParams)   ← publishes to state.context.persistentParams
```

The two interceptors are **two phases of one synchronous window** (core's `buildNavigateState` runs `forwardState` then `buildPath` back-to-back):

- **`#forwardStateParams`** (forwardState phase, runs first) — `extractOwnParams` → for a tracked param passed as `undefined`, RECORD it in the transient `#pendingRemovals` set (does **not** mutate the tracked set/snapshot — that would drop the param before guards run, #803) → `mergeParams` (honors `undefined` as a delete for this transition).
- **`#buildPathParams`** (buildPath phase, runs second) — `extractOwnParams` → validate → `mergeParams` → drop the `#pendingRemovals` keys so the built URL matches the forwarded params (the `undefined` marker is gone by now, so a plain re-merge would re-inject the removed param) → clear `#pendingRemovals`. A standalone `router.buildPath()` sees an empty set and injects normally.

Both interceptors take the third `search` argument (RFC-4 M2 / #1548). The `forwardState` interceptor **forwards** it down the chain (so a downstream `search-schema` interceptor still sees the matched query on the URL→State path) and keeps injecting persistent params into the **path bag** (the navigate split re-routes the query-typed ones into `state.search`). The `buildPath` interceptor is **search-aware**: when the caller passes an explicit `search` channel (`buildPath(name, params, search)` / the descriptor navigate path), persistent params are injected into `search` — the channel the built URL takes its query from; otherwise into the params bag (the v1 single-bag path). The `#pendingRemovals` window works identically in either channel.

**Permanent removal happens in `onTransitionSuccess`, not in the interceptors** — keyed on the committed state, so a rejected/cancelled navigation never drops the param (#803).

## State Context

The plugin publishes a read-only snapshot of current persistent params to `state.context.persistentParams` via the claim-based State Context API.

- **Claim:** `api.claimContextNamespace("persistentParams")` in the constructor. Returns `{ write, release }`.
- **Write:** `claim.write(toState, #persistentParams)` called at the end of `onTransitionSuccess`, after the internal snapshot is updated. Runs before subscriber callbacks, so `router.subscribe()` listeners always see the latest values.
- **Release:** `claim.release()` called in `teardown`, before the `setRootPath` restore.
- **Type:** Module augmentation on `@real-router/types` adds `persistentParams?: Params` to `StateContext`.

Components can use `state.context.persistentParams` to distinguish persistent (query) params from route-specific (path) params in `state.params`. Post-RFC-4-M2 (#1548) the two normally live in different channels — persistent params in `state.search`, route path params in `state.params` — so `state.context.persistentParams` gives a stable, channel-independent read regardless of which bag a value currently rides in (see the `onTransitionSuccess` gotcha below for the one case — a `makeState`-built state — where a persisted value still rides in `state.params`).

## Gotchas

### Parameter removal is permanent — but only once the removal commits

Passing `undefined` for a tracked param deletes it from `paramNamesSet` and from `#persistentParams`. It won't be re-persisted even if you pass it again later:

```typescript
router.navigate("page", { lang: undefined }); // lang removed once this navigation commits
router.navigate("page", { lang: "en" });       // lang NOT re-added — Set no longer tracks it
```

Once removed, the param is gone for the lifetime of the plugin instance.

**The removal is committed in `onTransitionSuccess`, not in the interceptor (#803).** If the removal navigation is rejected by a guard or superseded by a concurrent navigate, it never reaches `onTransitionSuccess`, so the param stays persisted — the drop is not permanent until the transition actually commits. Within the current transition the param is still absent from the built state (`state.search` normally, `state.params` for a `makeState`-built state) and from `state.path` (the `buildPath` phase honors the pending removal); it is only re-persisted for **later** navigations when the removal did not commit.

### `setRootPath` throws during `router.dispose()`

Teardown calls `setRootPath(originalRootPath)` to restore the root path. When called from `router.dispose()`, the FSM is already in `DISPOSED` state, so `setRootPath`'s internal `throwIfDisposed()` throws. The teardown wraps only this call in try/catch and swallows the error silently — restoring root path on a destroyed router is a no-op anyway.

Interceptor removal (`#removeBuildPathInterceptor`, `#removeForwardStateInterceptor`) and `claim.release()` are called unconditionally before the try/catch.

### Rollback on partial initialization failure

The constructor registers side effects in order: `setRootPath` → `addInterceptor("buildPath")` → `addInterceptor("forwardState")`. If any step throws, the catch block calls the already-registered unsubscribers and restores the original root path before re-throwing. This path is marked `/* v8 ignore */` — it can't be triggered in normal usage.

### `initialParams` is frozen and shared across closures

`Object.freeze(initialParams)` runs in the factory before the `PluginFactory` closure captures it. The plugin constructor receives this frozen object as `persistentParams`. The plugin never mutates `initialParams` directly — when params change, it creates a new frozen object and reassigns `#persistentParams`. Safe to share.

### `paramNamesSet` is cloned per router instance

The factory creates one `paramNamesSet` from the config. Each `PluginFactory` invocation passes `new Set(paramNamesSet)` to the constructor. This prevents cross-router mutation: if two routers use the same factory result, removing a param on one doesn't affect the other.

### `mergeParams` does NOT self-sanitize

`mergeParams(persistent, current)` assumes `current` is already sanitized. The callers (`#forwardStateParams` / `#buildPathParams`) must call `extractOwnParams` first. If you call `mergeParams` directly with an unsanitized object, inherited properties will leak through.

### `onTransitionSuccess` — secondary sync for injection, PRIMARY for removal

The primary param **injection** happens in the interceptors. `onTransitionSuccess` updates `#persistentParams` to reflect what actually committed. For **removal**, though, it is the primary site (#803): a tracked key that is missing or `undefined` in the committed state (checked in `toState.search` first — the canonical channel post-M2 / #1548 — falling back to `toState.params` for a `makeState`-built state) is deleted from **both** `#persistentParams` and `#paramNamesSet` here — covering the explicit `navigate({ key: undefined })` removal (mergeParams dropped it for this transition) and the defensive `navigateToState` bypass (which skips the `forwardState` injection) with the same branch. Only a key that was really persisted (present with a defined value) is removed; a still-empty tracked key stays tracked so it can persist later.

After updating the snapshot, `onTransitionSuccess` publishes it to `state.context.persistentParams` via `claim.write(toState, #persistentParams)`. This happens before subscriber callbacks fire, so `router.subscribe()` listeners always see the current persistent params snapshot on `state.context.persistentParams`.

### Double initialization throws

`usePlugin` is called once per router. Calling it twice with the same factory (without `unsubscribe()` in between) throws from core: the second instance's `claimContextNamespace("persistentParams")` hits the already-claimed namespace (`CONTEXT_NAMESPACE_ALREADY_CLAIMED`). The plugin itself adds no explicit guard — the core namespace-claim collision is the backstop. (With `@real-router/validation-plugin`, the duplicate **factory** is rejected even earlier, before the factory runs — #726.)

### Composition order with `search-schema-plugin` decides whether persistent params are validated

This plugin's `forwardState` interceptor **injects** persistent params into the target state (it wraps `next()` and **fills in absent keys** — incoming params win over the stored ones). `@real-router/search-schema-plugin` also registers a `forwardState` interceptor, and it **validates** the result of its `next()`. Because core composes interceptors **LIFO** (last-registered = outermost), whichever plugin is registered **last** wraps the other — so registration order decides whether the injected persistent params pass through the schema:

```typescript
// RECOMMENDED — persistent-params first, search-schema second:
router.usePlugin(persistentParamsPluginFactory({ page: 1 }));
router.usePlugin(searchSchemaPlugin());
// search-schema is outermost → it validates the params this plugin injected
// → an invalid persisted value is stripped by the schema

// ALTERNATIVE — persistent-params second (this plugin outermost):
router.usePlugin(searchSchemaPlugin());
router.usePlugin(persistentParamsPluginFactory({ page: 1 }));
// this plugin injects AFTER the schema ran → persistent params bypass validation
```

Register this plugin **before** `search-schema-plugin` if you want persistent params validated by the schema (the safer default); register it after only when they must deliberately skip validation. This is a pure ordering choice — no code change, LIFO is working as documented. (`search-schema-plugin`'s CLAUDE.md and README carry the mirror note. #801)

> **Caveat — the recommended order is not a full "last line of defense" for `state.path`.** (#1231)
>
> - **`state.path` is out of the schema's reach.** This plugin registers **two** interceptors — `forwardState` (injects into state) **and** `buildPath` (injects stored values into the path-build params); `search-schema-plugin` hooks **only** `forwardState`. So even in the recommended order (schema outermost) the schema validates the `forwardState` channel only — an invalid persisted value is stripped from `state.params` but still reaches `state.path` (persistent, reload-stable), and no registration order fixes it. **Mitigation:** give persisted keys a `defaultParams` entry on schema'd routes — core's merge overrides the injected value, so the path stays clean. (An exhibit for the #802 "injection channels below the validation seam" class; do **not** give the schema a `buildPath` hook — that breaks the documented standalone-`buildPath` bypass.)
> - **The alternative-order leak only affects keys without a route default.** `mergeParams` fills persistent params **under** incoming params (`{ ...stored, ...incoming }`, fill-if-absent), so a key with a `defaultParams` value is supplied by core and wins over the injected persistent value — no leak even under the alternative order; only a persisted key **without** a route default leaks. Captured persistent values are clean by construction (taken from committed, schema-valid state).

## Module Structure

```
src/
├── factory.ts      — persistentParamsPluginFactory: validates config, builds initialParams,
│                     clones paramNamesSet, returns PluginFactory closure
├── plugin.ts       — PersistentParamsPlugin class: registers interceptors in constructor,
│                     claims "persistentParams" context namespace,
│                     exposes getPlugin() returning { onTransitionSuccess, teardown }
├── param-utils.ts  — extractOwnParams (prototype pollution guard), mergeParams (merge logic)
├── validation.ts   — validateConfig (factory-time), validateParamValue (nav-time),
│                     isValidParamsConfig, validateParamKey
├── types.ts        — PersistentParamsConfig = string[] | Record<string, string|number|boolean>
├── constants.ts    — ERROR_PREFIX, LOGGER_CONTEXT
└── index.ts        — Public exports: persistentParamsPluginFactory, PersistentParamsConfig
                      Module augmentation: declares StateContext.persistentParams on @real-router/types
```

Module augmentation in `index.ts` extends `@real-router/types` `StateContext` with `persistentParams?: Params`. This provides typed access to `state.context.persistentParams` for all consumers that import the plugin.
