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
navigate(name, params)
  → buildPath interceptor
      → #withPersistentParams(navParams)   ← merges persistent into nav params
      → next(route, mergedParams)

navigate(name, params)
  → forwardState interceptor
      → next(routeName, routeParams)       ← get base state
      → #withPersistentParams(result.params) ← inject persistent into state params

onTransitionSuccess(toState)
  → reads toState.params for each tracked key
  → updates #persistentParams snapshot
  → claim.write(toState, #persistentParams)   ← publishes to state.context.persistentParams
```

Both interceptors call `#withPersistentParams`, which:
1. Runs `extractOwnParams` on incoming params (prototype pollution guard)
2. Handles `undefined` values (removal)
3. Calls `mergeParams(persistentParams, safeParams)`

## State Context

The plugin publishes a read-only snapshot of current persistent params to `state.context.persistentParams` via the claim-based State Context API.

- **Claim:** `api.claimContextNamespace("persistentParams")` in the constructor. Returns `{ write, release }`.
- **Write:** `claim.write(toState, #persistentParams)` called at the end of `onTransitionSuccess`, after the internal snapshot is updated. Runs before subscriber callbacks, so `router.subscribe()` listeners always see the latest values.
- **Release:** `claim.release()` called in `teardown`, before the `setRootPath` restore.
- **Type:** Module augmentation on `@real-router/types` adds `persistentParams?: Params` to `StateContext`.

Components can use `state.context.persistentParams` to distinguish persistent params from route-specific params in `state.params`, which contains both merged together.

## Gotchas

### Parameter removal is permanent

Passing `undefined` for a tracked param deletes it from `paramNamesSet` and from `#persistentParams`. It won't be re-persisted even if you pass it again later:

```typescript
router.navigate("page", { lang: undefined }); // lang removed from Set
router.navigate("page", { lang: "en" });       // lang NOT re-added — Set no longer tracks it
```

Once removed, the param is gone for the lifetime of the plugin instance.

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

`mergeParams(persistent, current)` assumes `current` is already sanitized. The caller (`#withPersistentParams`) must call `extractOwnParams` first. If you call `mergeParams` directly with an unsanitized object, inherited properties will leak through.

### `onTransitionSuccess` is a secondary sync, not the primary source

The primary param injection happens in the interceptors. `onTransitionSuccess` only updates `#persistentParams` to reflect what actually committed. It also handles the defensive case where a state was committed via `navigateToState` (bypassing `forwardState`) — if a tracked key is missing or `undefined` in `toState.params`, it removes that key from `#persistentParams`.

After updating the snapshot, `onTransitionSuccess` publishes it to `state.context.persistentParams` via `claim.write(toState, #persistentParams)`. This happens before subscriber callbacks fire, so `router.subscribe()` listeners always see the current persistent params snapshot on `state.context.persistentParams`.

### Double initialization throws

`usePlugin` is called once per router. Calling it twice with the same factory (without `unsubscribe()` in between) throws from core. The plugin itself doesn't guard against this.

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
