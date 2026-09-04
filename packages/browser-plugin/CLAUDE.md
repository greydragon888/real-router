# @real-router/browser-plugin

> History API integration for browser URL synchronization

## Options

```typescript
browserPluginFactory({
  forceDeactivate: false, // default: false — run canDeactivate on back/forward. Set true to bypass
  base: "/app", // default: "" — base path for all routes
});
```

Only two options. Hash routing is handled by a separate `@real-router/hash-plugin`.

Both defaults come from `sharedUrlPluginDefaults` (`shared/browser-env/defaults.ts`) — `browser`, `hash` and `navigation` read the SAME object, because "does Back honour `canDeactivate`" is one product decision, not three. Changing it here changes it for all three, which is the point: the three former copies had drifted, and the drift reached users (#524 → #1645). URL mechanics (`hashPrefix`) and identifiers stay per-plugin.

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

The queue is emptied on `stop()` and `teardown()` too, via `PopstateHandler.discard` (#1922). Removing the listener is not enough — the in-flight transition's `finally` drains the queue unconditionally, so a queued event replayed after the plugin was gone: it navigated a router the plugin no longer serves, and on the strict-mode branch it wrote history directly (`rollbackUrlToCurrentState` is called by the handler, not by a hook, so removing the hooks does not stop it). `discard` runs unconditionally, outside the `#1213` shared-slot identity check — the queue belongs to this handler whoever owns the shared listener.

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
router.navigate(name, params, undefined, { replace: true }); // Full transition
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
- **`rollbackUrlToCurrentState`** rebuilds the URL from ALL of the surviving state — path params, `state.search`, and `currentState.context.url.hash` as the encoded fragment. It did neither of the last two until #1586: `PopstateHandlerDeps.buildUrl` still described the pre-#1548 three-argument form, so the `{ hash }` object landed in the `search` slot of the four-argument `createPluginBuildUrl` — dropping the real query and leaving `opts` undefined, which appended no fragment either. A type-equality pin between the deps signature and `createPluginBuildUrl`'s return type now fails the build if the two drift apart again.
- **Cached fragment, not a per-nav `location.hash` read (perf)**. `onTransitionSuccess` reads a cached `currentHash`, **not** `location.hash` — a per-nav `location.*` read forces the browser to synchronously commit the pending `pushState` (~0.04 ms/nav). The cache is seeded once in `onStart` via `getDecodedHash(browser)` (covers F5 / cold-load — `location.hash` already reflects the destination, and `popstate` doesn't fire for the initial document load), kept in sync by the plugin's own navigations (`pushState`/`replaceState` don't fire `hashchange`, so the plugin sets it), and refreshed by the shared `hashchange` listener (`Browser.addHashChangeListener` — the required subscription from #759, no-op in SSR via `createSafeBrowser`) for **external** fragment changes — anchor clicks, manual `location.hash =`. The **popstate** path still samples `location.hash` directly (`getCurrentHash`) — a rare back/forward event, not the per-nav hot path.

See [IMPLEMENTATION_NOTES.md](../../IMPLEMENTATION_NOTES.md) section "URL Fragment ('hash') Support" for the full design rationale.

### State Validation

External code can corrupt `history.state` — a previous page, another script, or
an entry written by an older version of the app. The plugin validates it via
`isStateStrict` (from browser-env) and falls back to `matchPath(location)` when
it does not hold up. Four things that guard does, each of which it did not
before #1837 / #1838:

- **Both restored channels are screened by VALUE.** `params` always was;
  `search` was shape-only until #1837, so a function, Symbol, BigInt, cycle or
  class instance rode into the frozen `state.search` while the identical value
  in `params` was refused. The query domain is untouched — a repeated key still
  restores as an array, a bare `?flag` as `null`.
- **It answers, it does not throw.** The entry may carry accessors or be a
  `get`-trapping Proxy; every read sits inside a boundary, so an unreadable
  payload is simply not restorable instead of surfacing as a critical error.
- **The entry is read ONCE per member.** The snapshot that is validated is the
  snapshot that is committed, so an entry answering differently between reads
  cannot have one shape approved and another one land.
- **A persisted `UNKNOWN_ROUTE` is not special-cased past `allowNotFound`.** It
  takes the same branch a live unmatched URL takes.

⚠ Only the first of those is visible in a real browser without help:
`history.pushState` serialises, so an accessor, a Proxy or a drifting entry
cannot come back from a genuine popstate. They are reachable from a synthetic
`PopStateEvent` and under jsdom, which stores the entry by identity — which is
also why the test estate was blind to the `DataCloneError` half for so long.

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

**Both halves of the call come from the resolved state (#1585).** `replaceHistoryState`
resolves the target through `buildNavigationState` and then uses that state
VERBATIM — as the `history.state` record AND as the input to `buildUrl`. Before
#1585 only the record did: the URL was built from the caller's raw arguments,
which reached the plain `buildPath` of the day — no `forwardTo` resolution,
no `forwardState` seam — so the pair could disagree about the very keys the seam contributes.
Measured with a `persistent-params`-style injection: the record read
`/posts/9?tab=new&sort=date&lang=de` and the URL beside it `/posts/9?tab=new&sort=date`;
for a forwarding route the record said `posts` and the URL `/old`. It was the only
one of the five history writers reading the caller's bag — `onTransitionSuccess`
(all three plugins) and `rollbackUrlToCurrentState` all build from a committed
state, and `navigate` has always kept the pair equal.

Two consequences worth knowing: the state is no longer re-made through
`api.makeState` (that rebuild was a leftover from `buildState`, which built no
path of its own — it produced a byte-identical state, so it was redundant work
per history record), and
`createReplaceHistoryState` no longer takes a `router` argument, since the
rebuild was its only use for one.

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
├── constants.ts   — Constants (defaultOptions = sharedUrlPluginDefaults from browser-env, POPSTATE_SOURCE, LOGGER_CONTEXT)
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
