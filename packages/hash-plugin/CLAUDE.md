# @real-router/hash-plugin

> Hash-based routing for browser URL synchronization

## Options

```typescript
hashPluginFactory({
  hashPrefix: "!",          // default: "" — prefix after # (e.g., "!" → #!/path)
  base: "",                 // default: "" — base path before hash (e.g., "/app" → /app#!/path)
  forceDeactivate: true,    // default: true — bypass canDeactivate on back/forward
})
```

Three options. History API routing is handled by a separate `@real-router/browser-plugin`.

## Navigation Flow

```
Router Navigation:
  navigate() → Promise<State> → onTransitionSuccess → pushState/replaceState

Browser Back/Forward:
  popstate → handler (browser-env) → router.navigate()/navigateToNotFound()/navigateToDefault() → pushState/replaceState
```

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

### Base Path Normalization
```typescript
{ base: "/app/" }  // Input
{ base: "/app" }   // Normalized (no trailing slash, via normalizeBase from browser-env)
```

### replaceHistoryState vs navigate
```typescript
router.replaceHistoryState(name, params); // URL only, no transition
router.navigate(name, params, { replace: true }); // Full transition
```

### buildUrl vs buildPath
```typescript
router.buildPath("users", { id: 1 });  // "/users/1" (core)
router.buildUrl("users", { id: 1 });   // "#!/users/1" (plugin, with hashPrefix "!")
```

### Hash Prefix Must Be Escaped
```typescript
{ hashPrefix: "." }  // Careful - . is regex special char
// Plugin handles escaping internally via createHashPrefixRegex (pre-computed at factory time)
```

### No Hash Fragment Preservation
Unlike browser-plugin, there is no hash preservation — the hash IS the route.

### Limitations: URL Fragments via `<Link hash>` / `opts.hash` (#532)

`@real-router/browser-plugin` and `@real-router/navigation-plugin` ship a first-class URL-fragment surface: `<Link hash>`, `router.navigate(name, params, { hash })`, `router.buildUrl(name, params, { hash })`, and a `state.context.url = { hash, hashChanged }` namespace.

Hash-plugin **does not** support this surface — `#` is the route delimiter here, so URL fragments are structurally incompatible:

- `pluginBuildUrl` accepts the `{ hash }` option for typing parity (TS interface merge requires identical signatures across all 3 URL plugins) but ignores it at runtime.
- A one-time `console.warn` is emitted on the first invocation with `opts.hash !== undefined`, telling the user to switch to browser-plugin / navigation-plugin if URL fragments are required. Inline `let warned = false` pattern.
- `state.context.url` is **not** claimed by hash-plugin → `state.context.url === undefined` at runtime. Hash-aware sources (`createActiveRouteSource({ hash })`, `useIsActiveRoute(name, params, { hash })`) consequently return `false` for any non-undefined `hash`.
- Mutually exclusive with browser-plugin / navigation-plugin: only one URL plugin may be installed per router instance.

See [IMPLEMENTATION_NOTES.md](../../IMPLEMENTATION_NOTES.md) section "URL Fragment ('hash') Support" for design context.

### State Validation
External code can corrupt `history.state`. Plugin validates structure via `isStateStrict` (from browser-env) and ignores invalid states gracefully.

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
  path: "/users/123"
}
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
