# @real-router/hash-plugin

> Hash-based routing for browser URL synchronization

## Options

```typescript
hashPluginFactory({
  hashPrefix: "!", // default: "" — prefix after # (e.g., "!" → #!/path)
  base: "", // default: "" — base path before hash (e.g., "/app" → /app#!/path)
  forceDeactivate: true, // default: true — bypass canDeactivate on back/forward
});
```

Three options. History API routing is handled by a separate `@real-router/browser-plugin`.

## Navigation Flow

```
Router Navigation:
  navigate() → Promise<State> → onTransitionSuccess → pushState/replaceState

Browser Back/Forward:
  popstate → handler (browser-env) → router.navigate()/navigateToNotFound()/navigateToDefault() → pushState/replaceState

External Fragment Change (native <a href="#/x">, address-bar edit, location.hash=):
  hashchange → handler (browser-env) → router.navigate()/navigateToNotFound() → replaceState
```

Both `popstate` and `hashchange` route through the **same** `createPopstateHandler`. A hash-changing history traversal fires **both** events; `createHashSyncLifecycle` dedups the pair (see [Gotchas](#hashchange-listener--popstatehashchange-dedup-759)) so exactly one navigation runs.

### Promise-Based API

All navigation methods return `Promise<State>`:

- `router.start(path?)` — path made optional via `createStartInterceptor` from `browser-env` which injects `browser.getLocation()` when no path given
- `router.navigate()` used in popstate handler with `await` and try/catch
- `router.navigateToNotFound(path?)` — called when `allowNotFound: true` and URL doesn't match any route on popstate (synchronous, returns `State`)
- `router.navigateToDefault()` called as fallback when URL doesn't match any route and `allowNotFound` is `false`

## Gotchas

### Popstate Race Condition

Handled by `createPopstateHandler` in `browser-env` via deferred queue:

```
Click back → transition starts
Click back again → event DEFERRED (not lost)
Transition completes → process deferred event
```

Only the **last** deferred event is kept (intermediate states skipped).

### Not-Found Popstate Same-State Short-Circuit (#1448)

`navigateToNotFound` is synchronous and **bypasses the navigate pipeline**, so it has no `SAME_STATES` guard of its own — the deferred queue above never engages for a not-found storm (each event fully commits before the next runs). The popstate handler adds the missing guard: a back/forward popstate that resolves to the `UNKNOWN_ROUTE` **already committed for the exact same path** is skipped. A storm of identical not-found popstates therefore collapses to a **single** commit, parity with the matched-route branch (where `navigateToState` suppresses the same-state case). The guard is **path-specific** — a popstate to a _different_ unmatched path still navigates. Shared via `browser-env`, so browser-plugin gets the same short-circuit.

### Hashchange listener + popstate/hashchange dedup (#759)

Unlike browser-plugin (which uses `createPopstateLifecycle`, popstate only), hash-plugin uses `createHashSyncLifecycle` from `browser-env` — it registers **both** `popstate` and `hashchange`. This is what makes external fragment changes reach the router: a native `<a href="#/x">`, a manual address-bar hash edit, or `location.hash = "..."` fire `hashchange` **only** (never `popstate`; `pushState`/`replaceState` — the plugin's own writes — never fire `hashchange` either), so a popstate-only listener would silently ignore them.

A hash-changing **back/forward** traversal fires **both** events in one browser task — but a **microtask checkpoint runs between the two listeners** (verified in Chromium the order is `[popstate, microtask, hashchange, macrotask]`). Handling both double-navigates, so the second of the pair is dropped. The dedup is **order-independent**: two type-scoped flags (`sawPopstate` / `sawHashchange`) drop whichever of the pair arrives second — regardless of which the browser fires first. The flags reset on a **macrotask** (`setTimeout 0`), **not** a microtask (#1228): a microtask reset fired on the checkpoint mid-pair, clearing the flags before the pair's second event, which then double-navigated → a phantom `SAME_STATES` on **every** hash back/forward. The macrotask reset fires after the pair completes, so the guard spans the whole pair; distinct user gestures (later macrotasks) are never coalesced, and same-type bursts (two rapid `popstate`s → the deferred-event path above) are unaffected because a `popstate` only ever blocks a following `hashchange`, never another `popstate`.

Both listeners share the single `shared.removePopStateListener` slot as a combined remover, so the factory-pool last-wins cleanup (#758) is unchanged.

### Base Path Normalization

```typescript
{
  base: "/app/";
} // Input
{
  base: "/app";
} // Normalized (no trailing slash, via normalizeBase from browser-env)
```

### replaceHistoryState vs navigate

```typescript
router.replaceHistoryState(name, params); // URL only, no transition
router.navigate(name, params, undefined, { replace: true }); // Full transition
```

### buildUrl vs buildPath

```typescript
router.buildPath("users", { id: 1 }); // "/users/1" (core)
router.buildUrl("users", { id: 1 }); // "#!/users/1" (plugin, with hashPrefix "!")
```

### Hash Prefix Must Be Escaped

```typescript
{
  hashPrefix: ".";
} // Careful - . is regex special char
// Plugin handles escaping internally via createHashPrefixRegex (pre-computed at factory time)
```

### No Hash Fragment Preservation

Unlike browser-plugin, there is no hash preservation — the hash IS the route.

### Limitations: URL Fragments via `<Link hash>` / `opts.hash` (#532)

`@real-router/browser-plugin` and `@real-router/navigation-plugin` ship a first-class URL-fragment surface: `<Link hash>`, `router.navigate(name, params, search, { hash })`, `router.buildUrl(name, params, search, { hash })` (options at position 4 since RFC-4 M2, #1548), and a `state.context.url = { hash, hashChanged }` namespace.

Hash-plugin **does not** support this surface — `#` is the route delimiter here, so URL fragments are structurally incompatible:

- `pluginBuildUrl` accepts the `{ hash }` option for typing parity (TS interface merge requires identical signatures across all 3 URL plugins) but ignores it at runtime.
- A one-time `console.warn` is emitted on the first invocation with `opts.hash !== undefined`, telling the user to switch to browser-plugin / navigation-plugin if URL fragments are required. Inline `let warned = false` pattern.
- `state.context.url` is **not** claimed by hash-plugin → `state.context.url === undefined` at runtime. Hash-aware sources (`createActiveRouteSource({ hash })`, `useIsActiveRoute(..., hash)`) consequently return `false` for any non-undefined `hash`.
- Mutually exclusive with browser-plugin / navigation-plugin: only one URL plugin may be installed per router instance.

See [IMPLEMENTATION_NOTES.md](../../IMPLEMENTATION_NOTES.md) section "URL Fragment ('hash') Support" for design context.

### State Validation

External code can corrupt `history.state`. Plugin validates structure via `isStateStrict` (from browser-env) and ignores invalid states gracefully.

### Popstate history-write skip (#1353)

On back/forward the browser has **already** restored the target entry's `{name, params, path}` and URL before firing `popstate`, so `onTransitionSuccess`'s `replaceState` re-writes identical values — a value-level no-op that still fires a **second** `updateForSameDocumentNavigation` Blink event per nav. The write is skipped when `canSkipPopstateHistoryWrite` (browser-env) proves it a no-op: `source === "popstate"` (via the `source` NavigationOptions augmentation), `replace` is true, and the resolved target deep-equals the live `history.state` (`Browser.getState` reader + same `path` + `router.areStatesEqual`). Every **load-bearing** write is kept — redirect/normalization (path or params differ), corrupted/missing `history.state` (fails `isStateStrict`), or a custom `Browser` without `getState`. `url` is only built when the write actually happens. Same guard as browser-plugin — the logic lives in shared `browser-env`.

### SSR Safety

```typescript
// createSafeBrowser() from browser-env detects environment:
// typeof globalThis.window !== "undefined" && !!globalThis.history
// Returns no-op fallbacks in SSR
```

### CANNOT_DEACTIVATE Recovery

When guard blocks navigation but browser already changed URL — critical error recovery in browser-env restores the previous URL via `replaceState`.

## State in History

```typescript
history.state = {
  name: "users.view",
  params: { id: "123" },
  search: {},
  path: "/users/123",
};
```

## Module Structure

```
src/
├── plugin.ts      — HashPlugin class (wires browser-env helpers with hash URL logic)
├── factory.ts     — hashPluginFactory (validation, browser creation, prefixRegex pre-computation, instance creation)
├── types.ts       — HashPluginOptions (hashPrefix, base, forceDeactivate)
├── hash-utils.ts  — Hash URL parsing (extractHashPath, hashUrlToPath, createHashPrefixRegex)
├── validation.ts  — Options validation (delegates to createOptionsValidator from browser-env)
├── constants.ts   — Constants (defaultOptions, source, LOGGER_CONTEXT)
└── index.ts       — Public exports + module augmentation
```

### Key dependency: `browser-env`

Most browser abstractions (Browser interface, popstate handling, SSR fallback, state validation, history updates) live in the private `browser-env` package — shared with `browser-plugin`.

hash-plugin imports from `browser-env`:

- `createSafeBrowser`, `normalizeBase`, `safelyEncodePath` — factory setup
- `createStartInterceptor`, `createReplaceHistoryState` — router extensions
- `createPopstateHandler`, `createPopstateLifecycle` — popstate lifecycle
- `shouldReplaceHistory`, `updateBrowserState` — transition handling
- `safeParseUrl` — URL parsing in `hashUrlToPath`
- `createOptionsValidator` — options validation

Plugin uses `api.extendRouter()` to formally register `buildUrl`, `matchUrl`, `replaceHistoryState` on the router instance. The returned unsubscribe function is called in `teardown` to remove them. `declare module` augmentation in `index.ts` provides compile-time types for these methods.

### Key difference from browser-plugin: pre-computed regex

Hash prefix stripping requires regex (e.g., `hashPrefix: "!"` → `/^#\\!/`). `createHashPrefixRegex(hashPrefix)` in `hash-utils.ts` pre-computes the regex once at factory creation time. Returns `RegExp | null` (`null` when prefix is empty — uses simple `hash.slice(1)` instead). No runtime caching needed.
