# @real-router/browser-plugin

> History API integration for browser URL synchronization

## Options

```typescript
browserPluginFactory({
  forceDeactivate: true, // default: true — bypass canDeactivate on back/forward
  base: "/app", // default: "" — base path for all routes
});
```

Only two options. Hash routing is handled by a separate `@real-router/hash-plugin`.

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

### Not-Found Popstate Same-State Short-Circuit (#1448)

`navigateToNotFound` is synchronous and **bypasses the navigate pipeline**, so it has no `SAME_STATES` guard of its own — the deferred queue above never engages for a not-found storm (each event fully commits before the next runs). The popstate handler adds the missing guard: a back/forward popstate that resolves to the `UNKNOWN_ROUTE` **already committed for the exact same path** is skipped. A storm of identical not-found popstates therefore collapses to a **single** commit, parity with the matched-route branch (where `navigateToState` suppresses the same-state case). The guard is **path-specific** — a popstate to a _different_ unmatched path still navigates. Shared via `browser-env`, so hash-plugin gets the same short-circuit.

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
router.navigate(name, params, { replace: true }); // Full transition
```

### buildUrl vs buildPath

```typescript
router.buildPath("users", { id: 1 }); // "/users/1" (core)
router.buildUrl("users", { id: 1 }); // "/app/users/1" (plugin, with base)
```

### Hash Fragment Support (#532)

URL fragments are first-class state, owned by the plugin. Stored decoded in `state.context.url` (shared namespace claimed by both URL plugins; mutually exclusive with `@real-router/hash-plugin` at runtime).

- **State namespace**: `state.context.url = { hash: string; hashChanged: boolean }` — hash is decoded, no leading `#`. `hashChanged` is `true` when the committed hash differs from the previous transition's `state.context.url.hash` — any hash change, whether browser-driven (popstate hash-only nav) or programmatic (`navigate({ hash })`).
- **Tri-state `opts.hash`** in `router.navigate(name, params, search?, { hash })` (options at position 4 since RFC-4 M2, #1548): `undefined` preserves, `""` clears, non-empty value sets. Same widening on `router.buildUrl` and `router.replaceHistoryState`.
- **Popstate hash detection**: `popstate` events do **not** carry the URL — the plugin samples `location.hash` post-update via `getDecodedHash(browser)`. `createPopstateHandler` receives new `getCurrentHash` and `getCurrentContextHash` deps; same-path-different-hash is forwarded as `{ force: true, hashChange: true, hash }` to bypass `SAME_STATES`.
- **`rollbackUrlToCurrentState`** preserves the hash on guard rejection — reads `currentState.context.url.hash` and rebuilds the URL with the encoded fragment.
- **Cached fragment, not a per-nav `location.hash` read (perf)**. `onTransitionSuccess` reads a cached `currentHash`, **not** `location.hash` — a per-nav `location.*` read forces the browser to synchronously commit the pending `pushState` (~0.04 ms/nav). The cache is seeded once in `onStart` via `getDecodedHash(browser)` (covers F5 / cold-load — `location.hash` already reflects the destination, and `popstate` doesn't fire for the initial document load), kept in sync by the plugin's own navigations (`pushState`/`replaceState` don't fire `hashchange`, so the plugin sets it), and refreshed by the shared `hashchange` listener (`Browser.addHashChangeListener` — the required subscription from #759, no-op in SSR via `createSafeBrowser`) for **external** fragment changes — anchor clicks, manual `location.hash =`. The **popstate** path still samples `location.hash` directly (`getCurrentHash`) — a rare back/forward event, not the per-nav hot path.

See [IMPLEMENTATION_NOTES.md](../../IMPLEMENTATION_NOTES.md) section "URL Fragment ('hash') Support" for the full design rationale.

### State Validation

External code can corrupt `history.state`. Plugin validates structure via `isStateStrict` (from browser-env) and ignores invalid states gracefully.

### Popstate history-write skip (#1353)

On back/forward the browser has **already** restored the target entry's `{name, params, path}` and URL before firing `popstate`, so `onTransitionSuccess`'s `replaceState` re-writes identical values — a value-level no-op that still fires a **second** `updateForSameDocumentNavigation` Blink event per nav (lean native routers emit one; real-router emitted two). The write is skipped when `canSkipPopstateHistoryWrite` (browser-env) proves it a no-op: `source === "popstate"`, `replace` is true, and the resolved target deep-equals the live `history.state` (`Browser.getState` reader + same `path` + `router.areStatesEqual` with query params compared). Every **load-bearing** write is kept — redirect/normalization (path or params differ), corrupted/missing `history.state` (fails `isStateStrict`), or a custom `Browser` without `getState` (opt-in, non-breaking). The guard runs **after** `claim.write`/`urlClaim.write`, so subscribers still receive the transition; only the redundant native write is elided. `getState` is a rare popstate-path read (not the per-nav hot path — cf. #1019). The deferred-popstate replay (#757) is unaffected: it reads the event's own snapshot, not the live entry this write would commit. Shared via `browser-env`, so hash-plugin gets the same skip.

### SSR Safety

```typescript
// createSafeBrowser() from browser-env detects environment:
// typeof globalThis.window !== "undefined" && !!globalThis.history
// Returns no-op fallbacks in SSR
```

### CANNOT_DEACTIVATE Recovery

When guard blocks navigation but browser already changed URL — critical error recovery in browser-env restores the previous URL via `replaceState`.

### Explicit `replace: false` on first navigation → push

`router.navigate(..., { replace: false })` before any successful navigation creates a **push** entry (not replace). The `??` operator keeps the explicit `false`. Omit `replace` (or set `true`) if you want replace-on-first behavior.

### replaceHistoryState hash semantics

`replaceHistoryState(name, params, search?, options?)` accepts a `search` query channel (position 3, RFC-4 M2 #1548) and an optional `{ hash }` field with the same tri-state semantics as `router.navigate` (undefined preserves, `""` clears, value sets). When omitted, the current `browser.getHash()` is preserved — symmetric with `onTransitionSuccess`.

## State in History

```typescript
history.state = {
  name: "users.view",
  params: { id: "123" },
  search: { tab: "posts" },
  path: "/users/123?tab=posts",
};
```

Since RFC-4 M2 (#1548) the buffered state carries a dedicated `search` (query)
channel alongside path-only `params` — a frozen `{}` when the route has no query.

## Module Structure

```
src/
├── factory.ts     — browserPluginFactory + internal createDefaultBrowser / createBrowserPlugin (validation, browser creation, plugin assembly, onTransitionSuccess)
├── types.ts       — BrowserPluginOptions, BrowserContext, BrowserSource
├── browser-env/   — Symlink → shared/browser-env (extractPath, buildUrl, urlToPath, popstate, validation, createUpdateBrowserState, …)
├── validation.ts  — Options validation (delegates to createOptionsValidator from browser-env)
├── constants.ts   — Constants (defaultOptions, POPSTATE_SOURCE, LOGGER_CONTEXT)
└── index.ts       — Public exports + module augmentation (StateContext.browser, NavigationOptions.source)
```

### Key dependency: `browser-env`

Most browser abstractions (Browser interface, popstate handling, SSR fallback, state validation, history updates) live in the private `browser-env` package — shared with `hash-plugin`.

browser-plugin imports from `browser-env`:

- `createSafeBrowser`, `normalizeBase`, `safelyEncodePath` — factory setup
- `createStartInterceptor`, `createReplaceHistoryState` — router extensions
- `createPopstateHandler`, `createPopstateLifecycle` — popstate lifecycle
- `shouldReplaceHistory`, `updateBrowserState` — transition handling
- `safeParseUrl` — URL parsing in `urlToPath`
- `createOptionsValidator` — options validation

Plugin uses `api.extendRouter()` to formally register `buildUrl`, `matchUrl`, `replaceHistoryState` on the router instance. The returned unsubscribe function is called in `teardown` to remove them. `declare module` augmentation in `index.ts` provides compile-time types for these methods.

### Router Extensions

| Method                                                    | Returns              | Description                                                                                                                                                                                                  |
| --------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `buildUrl(name, params?, search?, options?: { hash? })`   | `string`             | Build full URL with base path. Query channel at position 3 (RFC-4 M2, #1548); options shift to 4. Optional `hash` (decoded, no leading `#`) is encoded via `encodeURI(s).replace(/#/g, "%23")` and appended. |
| `matchUrl(url)`                                           | `State \| undefined` | Parse URL to router state                                                                                                                                                                                    |
| `replaceHistoryState(name, params?, search?, options?: { hash? })` | `void`               | Update browser URL without triggering navigation. Tri-state `hash`: `undefined` preserves, `""` clears, value sets.                                                                                          |
