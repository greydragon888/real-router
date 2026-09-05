# Architecture

> Detailed architecture for AI agents and contributors

## Overview

`@real-router/persistent-params-plugin` automatically injects a fixed set of query parameters into every navigation transition. Once a parameter value is observed in a committed state, it's stored internally and merged into the query channel of every subsequent `forwardState` call — the seam both `router.navigate` and `router.buildPath` run (#2087).

**Core role:** A stateful interceptor layer that sits between the caller's navigation params and the core's path/state builders. Contains no URL parsing or browser logic — only param merging, storage, and validation.

**Integration points with the core:**

- `addInterceptor("forwardState", ...)` — injects persistent params into every state built during navigation
- `api.setRootPath(...)` — extends the root path with query param placeholders so the core's path builder knows about the persistent params
- `api.claimContextNamespace("persistentParams")` — claims exclusive write access to `state.context.persistentParams`
- Plugin hook (`onTransitionSuccess`) — reads committed state to update stored param values, then publishes snapshot to `state.context.persistentParams` via `claim.write()`
- Plugin hook (`teardown`) — removes interceptors, releases the context claim via `claim.release()`, and restores the original root path

## Package Structure

```
persistent-params-plugin/
├── src/
│   ├── index.ts           — Public API (exports factory + PersistentParamsConfig type)
│   │                        Module augmentation: StateContext.persistentParams on @real-router/core/types
│   ├── factory.ts         — persistentParamsPluginFactory (validation, initialParams, paramNamesSet, closure)
│   ├── plugin.ts          — PersistentParamsPlugin class (interceptors, state updates, teardown)
│   ├── param-utils.ts     — Pure param utilities (extractOwnParams, mergeParams)
│   ├── validation.ts      — Config + runtime value validation (validateConfig, validateParamValue)
│   ├── types.ts           — PersistentParamsConfig type
│   └── constants.ts       — ERROR_PREFIX, LOGGER_CONTEXT
```

## Module Dependency Graph

```
index.ts
    └── factory.ts
            ├── plugin.ts
            │       ├── param-utils.ts
            │       ├── validation.ts
            │       │       └── constants.ts
            │       └── constants.ts
            └── validation.ts

types.ts  ← imported by factory.ts, validation.ts

index.ts also declares module augmentation on @real-router/core/types (StateContext)
```

External dependencies:

| Dependency           | What it provides                                             | Used in                   |
| -------------------- | ------------------------------------------------------------ | ------------------------- |
| `@real-router/core`  | `getPluginApi`, types (`PluginApi`, `Params`, `State`, etc.) | `factory.ts`, `plugin.ts` |
| `@real-router/core/types` | `StateContext` interface (module augmentation target)         | `index.ts`                |
| `type-guards`        | `isPrimitiveValue` — rejects NaN, Infinity, objects, arrays  | `validation.ts`           |

## Factory + Class Pattern

### Separation of Concerns

`persistentParamsPluginFactory()` in `factory.ts` and `PersistentParamsPlugin` in `plugin.ts` are intentionally separate:

```
persistentParamsPluginFactory(params)   ← factory.ts
        │
        │  Runs once on call:
        │  - validateConfig(params)
        │  - builds paramNames array
        │  - early return noop if paramNames.length === 0
        │  - builds initialParams object (array → all undefined, object → copy)
        │  - Object.freeze(initialParams)
        │  - creates paramNamesSet = new Set(paramNames)
        │
        └── returns PluginFactory (closure)
                │
                │  Called by the router on router.usePlugin():
                │
                ├── api = getPluginApi(router)
                ├── new Set(paramNamesSet)  ← clone, not shared
                └── new PersistentParamsPlugin(api, initialParams, clonedSet, api.getRootPath())
                            │
                            │  Constructor:
                            │  - api.claimContextNamespace("persistentParams")
                            │  - api.setRootPath(originalRootPath + "?" + paramNames.join("&"))
                            │  - api.addInterceptor("forwardState", ...)
                            │  - rollback on partial failure
                            │
                            └── .getPlugin()  → Plugin { onTransitionSuccess, teardown }
```

**Why this split instead of a single object?**

- `factory.ts` runs once — validation and `initialParams` construction don't repeat on every `usePlugin()` call
- The closure clones `paramNamesSet` before passing it to the constructor, so the same factory can be used with multiple routers without shared mutable state
- `PersistentParamsPlugin` encapsulates the mutable `#persistentParams` field and the two interceptor unsubscribe functions — a class makes the private field discipline explicit
- Testability: `PersistentParamsPlugin` can be instantiated directly with a mock `PluginApi`

### Creation Flow

```typescript
// factory.ts
export function persistentParamsPluginFactory(
  params: PersistentParamsConfig = {},
): PluginFactory {
  validateConfig(params);

  const paramNames = Array.isArray(params) ? params : Object.keys(params);

  if (paramNames.length === 0) {
    return noop; // shared singleton — frozen by core
  }

  const initialParams: Params = {};
  // ... populate initialParams from array or object ...
  Object.freeze(initialParams);

  const paramNamesSet = new Set<string>(paramNames);

  return (router): Plugin => {
    const api = getPluginApi(router);
    const plugin = new PersistentParamsPlugin(
      api,
      initialParams,
      new Set(paramNamesSet), // clone per usePlugin() call
      api.getRootPath(),
    );

    return plugin.getPlugin();
  };
}
```

### Constructor: Context Claim and Interceptor Registration with Rollback

The constructor claims the `"persistentParams"` context namespace, then registers the interceptor and calls `setRootPath` inside a `try/catch`. If either step throws, an already-registered interceptor is removed and `setRootPath` is restored before re-throwing:

```typescript
// plugin.ts constructor (simplified)
try {
  api.setRootPath(`${originalRootPath}?${[...paramNamesSet].join("&")}`);
  removeForwardState = api.addInterceptor("forwardState", ...);
} catch (error) {
  removeForwardState?.();
  api.setRootPath(originalRootPath);
  throw new Error(`${ERROR_PREFIX} Failed to initialize: ...`, { cause: error });
}
```

This guarantees the router is never left in a partially-initialized state.

### getPlugin(): hooks only, no side effects

`getPlugin()` returns a plain `Plugin` object with two hooks. It does not register anything — all registration happens in the constructor. Calling `getPlugin()` multiple times is safe.

## Data Flow: Navigation with Persistent Params

### forwardState interceptor — one seam, both doors

```
router.navigate(name, params, search?)      ← RFC-4 M2 / #1548: search is arg 3
router.buildPath(name, params, search?)     ← the same seam, on the caller's intent (#2087)
        │
        ▼
  forwardState interceptor (registered in constructor)
        │
        ├── result = next(routeName, routeParams, routeSearch)
        │     └── core builds the State object; both channels flow through untouched
        │
        ├── #forwardStateSearch(result.search, result.params)  ← injects into the QUERY
        │     │                                                   channel (#1563) and leaves
        │     │                                                   result.params alone
        │     ├── extractOwnParams on both bags
        │     │     └── copies OWN keys only; every own key is kept as data
        │     ├── for each key in safeParams (the path bag — every key validated, as
        │     │     the plugin has always policed the single-bag argument):
        │     │     validateParamValue(key, value)   ← `undefined` is an accepted
        │     │                                         value: it IS the removal request
        │     ├── mergeParams(#persistentParams, safeSearch)
        │     │     ├── copy all persistent keys with defined values
        │     │     └── overlay safeSearch (undefined → delete, else overwrite)
        │     └── for each TRACKED key:
        │           own in safeSearch?          → validateParamValue(key, safeSearch[key])
        │           else undefined in safeParams? → drop ours; a removal spelled in the
        │                                            path bag, which core reads as a
        │                                            channel error only with a VALUE
        │
        └── return { ...result, search: mergedSearch }   ← result.params passed through as-is
```

One seam, one channel. Persistent params are QUERY params by the plugin's own root declaration (`setRootPath("?a&b")`), so they are injected into `search` — the channel the built URL takes its query from (#1563). The seam runs on the navigate path and on `router.buildPath` alike, so the query it returns is both what `state.search` carries and what the URL prints; there is no second injection point below the validation seam a route schema registers.

`#forwardStateSearch` does **not** mutate `paramNamesSet` / `#persistentParams` — that would drop the param before the deactivation/activation guards run, so a rejected or cancelled transition would lose it (#803). A removal marker (`{ key: undefined }`) is honored in **either** channel: `mergeParams` applies it in the query bag, the tracked-key loop in the path bag. The permanent removal is committed in `onTransitionSuccess`, against the state that actually committed.

### onTransitionSuccess: updating stored params and publishing to state context

```
Transition committed → onTransitionSuccess(toState)
        │
        ├── toState.name === UNKNOWN_ROUTE?                    ← #1676
        │     YES: publish the snapshot unchanged and RETURN.
        │          A 404 is hand-built with BOTH channels empty (it matched no
        │          route, so no route declares where its keys belong), so the
        │          absence below would read as a removal that nobody requested.
        │
        ├── for each key in paramNamesSet:
        │     inSearch = hasOwn(toState.search, key)          ← RFC-4 M2 / #1548:
        │     present  = inSearch || hasOwn(toState.params, key)  search is canonical,
        │     value    = inSearch ? toState.search[key]           params is the
        │                          : toState.params[key]           hand-built-state
        │                                                          (navigateToState) fallback
        │
        │     !present || value === undefined?
        │       YES: PRIMARY removal (#803) — if stored value was defined,
        │            delete it from #persistentParams AND paramNamesSet.
        │            Covers explicit navigate({key: undefined}) removals and
        │            navigateToState bypassing forwardState with one branch.
        │
        │     validateParamValue(key, value)
        │
        │     value !== #persistentParams[key]?
        │       YES: copy #persistentParams, set newParams[key] = value
        │
        ├── if any change: #persistentParams = Object.freeze(newParams)
        │
        └── claim.write(toState, #persistentParams)
              → publishes snapshot to state.context.persistentParams
              → runs before subscriber callbacks
```

`onTransitionSuccess` is the source of truth for what gets stored. The interceptors inject params optimistically; `onTransitionSuccess` confirms what the core actually committed and publishes the final snapshot to `state.context.persistentParams` for downstream consumers.

### Full navigation sequence

```
router.navigate("route2", { id: "2" })
        │
        ▼
  forwardState interceptor
        ├── next("route2", { id: "2" }) → State { params: { id: "2" }, search: {} }
        └── mergeParams({ mode: "dev" }, {})
              → State { params: { id: "2" }, search: { mode: "dev" } }
        │        (injected into the QUERY channel — the channel the plugin itself
        │         declared "mode" in via setRootPath("?mode"); the path bag is handed
        │         on untouched, so core has nothing to re-route, #1563)
        ▼
  core prints the URL from that query channel → "/route2/2?mode=dev"
        │
        ▼
  Transition committed
        │
        ▼
  onTransitionSuccess({ params: { id: "2" }, search: { mode: "dev" } })
        ├── #persistentParams stays { mode: "dev" } (no change; read from
        │     toState.search, the canonical channel)
        └── claim.write(toState, { mode: "dev" })
              → state.context.persistentParams = { mode: "dev" }
```

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
        ├── #claim.release()
        │     └── releases "persistentParams" context namespace
        │
        └── try { api.setRootPath(#originalRootPath) }
              catch { /* swallow silently */ }
```

**Why `setRootPath` is wrapped in try/catch:**

During `router.dispose()`, the FSM enters the `DISPOSED` state before plugin teardown runs. `setRootPath` calls `throwIfDisposed()` internally and throws `RouterError(ROUTER_DISPOSED)`. Restoring the root path on a destroyed router is unnecessary, so the error is swallowed. This branch is excluded from coverage (`v8 ignore`) because it requires a disposed router to trigger.

**Why interceptor removal and claim release cannot throw:**

`addInterceptor` returns a function that splices the interceptor out of an internal array. Array mutation is synchronous and infallible. `claim.release()` deletes the namespace from the internal claim records map — also synchronous and infallible. No external state is involved.

## Validation

### Config validation (factory, runs once)

`validateConfig(params)` in `validation.ts` checks the entire config before any state is created:

| Check          | Rule                                                                          |
| -------------- | ----------------------------------------------------------------------------- |
| Top-level type | Must be array or plain object (`Object.getPrototypeOf === Object.prototype`)  |
| Array items    | Non-empty strings, no special URL characters (`= & ? # % / \ ` or whitespace) |
| Object keys    | Same character rules as array items                                           |
| Object values  | Must pass `isPrimitiveValue` (rejects NaN, Infinity, objects, arrays, null)   |

`validateParamKey` uses a single regex `/[\s#%&/=?\\]/` — one pass, no repeated checks.

Throws `TypeError` with a descriptive message on any violation. The factory never returns a `PluginFactory` if config is invalid.

### Runtime param value validation (per navigation)

`validateParamValue(key, value)` is called inside `#forwardStateSearch` and `#onTransitionSuccess` for every persistent param encountered during navigation:

| Value                         | Result                                                      |
| ----------------------------- | ----------------------------------------------------------- |
| `undefined`                   | Allowed — flags removal (committed on success)              |
| `string`, `number`, `boolean` | Allowed                                                     |
| `null`                        | Throws `TypeError` with "cannot be null" message            |
| object, array                 | Throws `TypeError` with "must be a primitive value" message |

`isPrimitiveValue` from `type-guards` handles the primitive check, including rejection of `NaN` and `Infinity`.

## Parameter Removal Semantics

Setting a persistent param to `undefined` is a permanent deletion, not a temporary omission — **but the deletion is committed only when the navigation succeeds** (#803):

```
navigate("route", { mode: undefined })
        │
        ▼
  #forwardStateSearch(…, { mode: undefined })
        └── "mode" dropped from the merged query — for THIS transition only;
        │     neither paramNamesSet nor #persistentParams is touched, because
        │     this runs before the guards and a rejected or cancelled nav must
        │     not lose "mode"
        ▼
  the URL is printed from that same query channel → "mode" is off both
        │
        ▼
  guards pass, transition commits → onTransitionSuccess(toState)
        ├── paramNamesSet.delete("mode")      ← removed from tracking
        └── delete #persistentParams["mode"]  ← removed from stored values
        │
        ▼
  All subsequent navigations: "mode" is not injected
  Even if "mode" is passed explicitly, it won't be re-persisted
  (paramNamesSet no longer contains "mode")

  If instead a guard rejects or a concurrent navigate supersedes the removal,
  onTransitionSuccess never runs → "mode" stays persisted (rolled back).
```

This is intentional. Once removed, the param behaves as if it was never in the config. Re-initialization (unsubscribe + usePlugin again) is the only way to restore tracking.

## param-utils.ts: Pure Functions

All functions in `param-utils.ts` are pure (no side effects, no access to globals).

**`extractOwnParams(params)`**:

Iterates with `for...in` but guards with `Object.hasOwn`. Produces a new object containing only own enumerable properties. Called before any merge to strip inherited keys.

The core already validates that `params` has a standard prototype (`null` or `Object.prototype`) via `isParams()`, so inherited keys never reach the plugin in practice. The guard is a defense-in-depth measure.

**`mergeParams(persistent, current)`**:

```
persistent = { mode: "dev", lang: "en" }
current    = { id: "2", lang: undefined }

Step 1 — copy persistent (skip undefined values):
  result = { mode: "dev", lang: "en" }

Step 2 — overlay current:
  id: "2"        → result.id = "2"
  lang: undefined → delete result.lang

result = { mode: "dev", id: "2" }
```

`current` must be pre-sanitized via `extractOwnParams` by the caller. `mergeParams` does not repeat the prototype check.

## Root Path Extension

The plugin calls `api.setRootPath(originalRootPath + "?" + paramNames.join("&"))` in the constructor. This tells the core's path builder that the root path includes query param placeholders for all persistent params.

Without this, `router.buildPath("home")` would return `"/"` even when persistent params are active. With it, the core knows to include the param slots, and the `forwardState` interceptor fills them in — on that door as on the navigate one (#2087).

On teardown, `api.setRootPath(originalRootPath)` restores the original value.

## Performance

| Optimization                                   | Location             | Effect                                                                              |
| ---------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| `Object.freeze(initialParams)`                 | `factory.ts`         | Prevents accidental mutation; signals immutability intent                           |
| `new Set(paramNamesSet)` per `usePlugin()`     | `factory.ts` closure | Isolates mutable Set state per router instance                                      |
| Single `extractOwnParams` call per interceptor | `plugin.ts`          | One pass over params before merge                                                   |
| Lazy copy of `#persistentParams`               | `plugin.ts`          | `newParams ??= { ...this.#persistentParams }` — copy only when a change is detected |
| `Object.freeze(newParams)` after update        | `plugin.ts`          | Immutable snapshot; next update creates a new copy                                  |
| `noop` factory for empty config                | `factory.ts`         | Zero overhead when no params are configured                                         |
| `Set.has` / `Set.delete`                       | `plugin.ts`          | O(1) membership and removal checks                                                  |

## Related Documents

- [ARCHITECTURE.md](../../ARCHITECTURE.md) — System architecture of the monorepo
- [core/ARCHITECTURE.md](../core/ARCHITECTURE.md) — Core architecture (Plugin API, addInterceptor, setRootPath)
- [browser-plugin/ARCHITECTURE.md](../browser-plugin/ARCHITECTURE.md) — Example of a plugin using addInterceptor
- [INVARIANTS.md](INVARIANTS.md) — Property-based test invariants
