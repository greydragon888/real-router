# @real-router/navigation-plugin

> Navigation API integration for browser URL synchronization

## Options

```typescript
navigationPluginFactory({
  forceDeactivate: false, // default: false — run canDeactivate on back/forward. Set true to bypass.
  base: "/app", // default: "" — base path for all routes
});
```

Same two options as `browser-plugin`. Plugins are interchangeable at the options level.

## Navigation Flow

```
Router Navigation:
  navigate() → Promise<State> → onTransitionSuccess → navigation.navigate()

Browser Navigate Event:
  navigate event → handler → router.navigate()/navigateToNotFound()/navigateToDefault()
```

### Promise-Based API

All navigation methods return `Promise<State>`:

- `router.start(path?)` — path made optional via `createStartInterceptor` which injects `browser.getLocation()` when no path given
- `router.navigate()` used in navigate event handler with `await` and try/catch
- `router.navigateToNotFound(path?)` — called when `allowNotFound: true` and URL doesn't match any route on navigate event (synchronous, returns `State`)
- `allowNotFound: false` + unmatched URL — the plugin emits `$$error` with `ROUTE_NOT_FOUND` via `api.emitTransitionError()` and throws in the `event.intercept()` handler so the Navigation API auto-rolls back the URL. No silent `navigateToDefault()` fallback (see #483)

## Gotchas

### No Popstate Race Condition

The Navigation API serializes navigation via `event.intercept()` — only one navigation runs at a time. No deferred queue needed (unlike browser-plugin's popstate handling).

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

URL fragments are first-class state, owned by the plugin (not by core). Stored decoded in `state.context.url` (shared namespace claimed by both URL plugins; mutually exclusive with `@real-router/hash-plugin` at runtime).

- **State namespace**: `state.context.url = { hash: string; hashChanged: boolean }` — hash is decoded, no leading `#` (symmetric to params). `hashChanged` is `true` only on browser-driven hash-only navigation (`event.hashChange === true`).
- **Tri-state `opts.hash`** in `router.navigate(name, params, search?, { hash })` (options at position 4 since RFC-4 M2, #1548): `undefined` preserves current hash, `""` clears, non-empty value sets. Same widening on `router.buildUrl` and `router.replaceHistoryState`.
- **Browser-driven hash-only click**: `navigate-handler.ts` reads `event.hashChange` and forwards `{ force: true, hashChange: true, hash }` to `api.navigateToState` — bypasses core's `SAME_STATES` rejection. Subscribers disambiguate via `state.context.url.hashChanged`, not via the overloaded `force` flag.
- **Recovery paths preserve hash**: `syncUrlToRouterState` reads `currentState.context.url.hash` to rebuild the URL after guard rejection — without this, `CANNOT_DEACTIVATE` would silently strip the fragment.
- **F5 / cold-load: lazy read in `onTransitionSuccess`**. On the first transition (`!fromState`), the plugin calls `getDecodedHash(browser)` to read the previous hash. **NOT in the constructor** — by the time `onTransitionSuccess` fires, `location.hash` already reflects the destination URL, so F5 on `/page#section` is recovered without explicit priming. This is **separate** from the `navigationType` priming via `getActivationType()` documented in "Cross-document Activation Priming" — that priming is Navigation-API-only metadata and does not touch the URL fragment.

See [IMPLEMENTATION_NOTES.md](../../IMPLEMENTATION_NOTES.md) section "URL Fragment ('hash') Support" for the full design rationale.

### Navigation API Not Supported

If `"navigation" in globalThis` is false and no custom `browser` is injected, the factory throws immediately:

```
Error: [navigation-plugin] Navigation API is not supported. Use @real-router/browser-plugin instead.
```

### SSR Safety

```typescript
// factory.ts picks the browser impl via `"navigation" in globalThis`:
//   - true  → createNavigationBrowser(base) (real Navigation API wrapper)
//   - false → createNavigationFallbackBrowser("navigation-plugin") (no-op)
// `isBrowserEnvironment()` from browser-env is only used by the upfront
// throw-check (refuses SSR + real environment without Navigation API).
```

### CANNOT_DEACTIVATE: Manual URL sync after guard rejection

When a guard blocks navigation, `withRecovery` in `navigate-handler.ts` catches the `RouterError` and explicitly calls `syncUrlToRouterState` — `browser.navigate({ history: "replace" })` to the current router state — so URL and router state stay consistent.

Why manual instead of relying on Navigation API's built-in rollback on intercept rejection: in practice (Chromium headless, some cross-origin setups) the rollback leaves a visible "committed-then-reverted" URL window that breaks UI tests and flashes an incorrect URL. Manual sync from the syncing branch gives a single visible state transition.

`withRecovery` handles the two error classes:

- **Non-`RouterError`** (unexpected crashes) → `recoverFromNavigateError` — logs `Critical error in navigate handler` + calls `syncUrlToRouterState`.
- **`RouterError`** (guard reject, SAME_STATES, ROUTE_NOT_FOUND, CANCELLED) → `syncUrlToRouterState` only, no logging. Router already emitted `TRANSITION_ERROR` / `TRANSITION_CANCEL` — observers can subscribe there. `navigation.navigate().finished` resolves (URL is valid, just pointing back to previous state).

See #524 for why the previous "swallow silently" path was broken (URL committed, router state frozen, observable desync).

### Router-driven mutations re-enter the navigate handler (#518, #580)

`nav.navigate(...)` and `nav.traverseTo(...)` fire navigate events. Chromium delivers them synchronously inside the call; Safari 26.2 WKWebView delivers them on a subsequent task (#580 — render-loop in Tauri release on macOS 26.2). The handler must short-circuit events fired by the plugin's own writes regardless of delivery timing — otherwise it treats those events as user-initiated and re-issues `router.navigate(...)` in a loop.

Mechanism: `createNavigationBrowser` (`navigation-browser.ts`) tags every router-driven mutation with `info: PLUGIN_SYNC_INFO` — a stable string sentinel exported alongside it. The handler in `navigate-handler.ts` checks `event.info === PLUGIN_SYNC_INFO` at entry and intercepts with a noop handler. The bare `return` is not enough — per Navigation API spec, a same-origin `canIntercept` event left un-intercepted triggers Chromium's cross-document fallback (full reload). The noop intercept cancels the fallback without running router logic; state was already committed by the synchronous call site.

Why `info` rather than a synchronous flag: identity travels with the event, so the check is timing-independent. The previous `SyncingFlag` mechanism (raise-before / lower-in-finally inside `wrapNavigationBrowserWithSyncing`) assumed sync delivery and failed under Safari WKWebView — by the time the event arrived, the flag had already been lowered, and the loop fired. `updateCurrentEntry` is **not** tagged: it dispatches `currententrychange`, not `navigate`, so there is no event to short-circuit.

Consumers supplying a custom `NavigationBrowser` must pass `PLUGIN_SYNC_INFO` as `info` in their `nav.navigate` / `nav.traverseTo` calls (the constant is exported from the package barrel) — otherwise the handler will treat plugin-driven events as user-initiated under any browser. The built-in factory path (`createNavigationBrowser` and `createNavigationFallbackBrowser`) does this automatically.

### Error Recovery

`recoverFromNavigateError` in `navigate-handler.ts` restores the URL on non-RouterError exceptions by calling `browser.navigate(url, { history: "replace" })`.

### NavigationMeta Undefined in Guards During Programmatic Navigation

For programmatic navigation (`router.navigate()`), meta is written in `onTransitionSuccess`. Guards run before that, so `toState.context.navigation` is `undefined`. For browser-initiated navigation, meta is written in `onTransitionStart` — available in guards.

Exception — first transition after a cross-document load: the constructor primes `#capturedMeta` from `navigation.activation.navigationType`, so guards on the very first transition do see `toState.context.navigation` (with `userInitiated: false`, `direction: "forward"` for `push` else `"unknown"`). See "Cross-document Activation Priming" below.

### Cross-document Activation Priming (#531)

On F5, browser back/forward across the JS context boundary, or a fresh URL bar entry, the prior JS context is destroyed. The `navigate` event handler in `onStart` never sees the activation event. Without priming, `deriveNavigationType` falls through to `"replace"` for every initial transition — breaking scroll restoration on reload (#497) and any consumer branching on `state.context.navigation.navigationType`.

The plugin reads `navigation.activation.navigationType` ([Baseline 2026](https://html.spec.whatwg.org/multipage/nav-history-apis.html#dom-navigationactivation-navigationtype): Chrome 123+, Firefox 147+, Safari 26.2+) **once in the constructor** via `browser.getActivationType()` and primes `#capturedMeta` accordingly. The primed meta is consumed by the first `onTransitionStart`/`onTransitionSuccess` and cleared at line ~230 — subsequent same-document transitions use the existing `deriveNavigationType` flow.

Limitations:

- `userInitiated` is always `false` — the browser does not expose whether F5 came from a key press or `location.reload()`.
- `direction` for `traverse` is `"unknown"` — direction-from-activation (`from.index` vs. `entry.index`) is a possible follow-up; the conservative `"unknown"` matches the issue's acceptance criteria #4.
- Browsers without `navigation.activation` (Chrome 102–122, custom `NavigationBrowser` mocks) get `getActivationType() === undefined` — the plugin falls back to the legacy `deriveNavigationType` path. Acceptable for the sub-2% Chromium tail.

### UNKNOWN_ROUTE: updateCurrentEntry, Not navigate

When `navigateToNotFound` is called, the plugin uses `browser.updateCurrentEntry()` (not `browser.navigate()`). The URL remains unchanged — only the entry state is updated.

### Same-URL guard in onTransitionSuccess (#580)

When the target URL of a transition is canonically equal to the browser's current URL — for example the initial transition into a route whose path already matches the bootstrap URL, or `router.navigate(name, params, { reload: true })` to the current state — the plugin writes router state via `browser.updateCurrentEntry({ state })` instead of `browser.navigate(url, { history: "replace" })`. Both leave a single history entry with the new state, but `updateCurrentEntry` does not fire a navigate event.

This avoids two problems:

- **Chromium**: a same-URL `nav.navigate({history:"replace"})` would still fire a navigate event the handler must short-circuit via `event.info === PLUGIN_SYNC_INFO`. `updateCurrentEntry` skips that round-trip.
- **Safari 26.2 WKWebView under custom protocols** (`tauri://`, `app://`): same-URL `nav.navigate({history:"replace"})` is treated as a **cross-document** navigation. The JS context is discarded, the bootstrap re-runs, the plugin re-issues the call, and the cycle becomes a render-loop the user perceives as flicker (#580). The guard bypasses the broken code path entirely.

Comparison is via `isSameHref(finalUrl, browser.currentEntry?.url)` (`href-utils.ts`) — both URLs are run through the `URL` constructor so `scheme://host` and `scheme://host/` (special-scheme trailing-slash canonicalisation) compare equal. When `currentEntry?.url` is null or malformed the guard returns `false` and the plugin falls back to the navigate path.

**Behavioural consequence**: same-URL transitions no longer fire navigate events. Consumers that subscribed to navigate events for state-only changes must use `router.subscribe` instead; `state.context.navigation.navigationType` still reflects the logical type (`reload` / `replace`).

### History Extensions Use URL Matching (Not entry.getState())

`peekBack`/`peekForward`/`hasVisited`/`getVisitedRoutes`/`canGoBackTo` use URL matching to resolve `NavigationHistoryEntry` → `State`. They do NOT read `entry.getState()`. Reason: entries before plugin init have no state; entries may be stale after route reconfiguration; entries from other SPAs have foreign state.

### Explicit `replace: false` on first navigation → push

`router.navigate(..., { replace: false })` before any successful navigation creates a **push** entry (not replace). The `??` operator keeps the explicit `false`. Omit `replace` (or set `true`) if you want replace-on-first behavior.

### replaceHistoryState hash semantics

`replaceHistoryState(name, params, search?, options?)` accepts a `search` query channel (position 3, RFC-4 M2 #1548) and an optional `{ hash }` field with the same tri-state semantics as `router.navigate` (undefined preserves, `""` clears, value sets). When omitted, current `browser.getHash()` is preserved — symmetric with `onTransitionSuccess`.

### traverseToLast Excludes Current Entry

`traverseToLast(routeName)` finds the last entry matching `routeName`, but excludes the current entry to avoid `SAME_STATES`. Throws if the only matching entry is the current one.

## Navigation Metadata via State Context

The plugin claims **two** namespaces on `state.context`:

- `state.context.navigation` — `NavigationMeta` (this plugin only)
- `state.context.url` — `UrlContext = { hash, hashChanged }` (shared with `@real-router/browser-plugin`; mutually exclusive with `@real-router/hash-plugin`)

### Navigation Metadata

Navigation metadata is accessible via `state.context.navigation` (claim-based API):

```typescript
// In subscribe callbacks
router.subscribe((state) => {
  const meta = state.context.navigation;
  console.log(meta?.navigationType); // "push" | "replace" | "traverse" | "reload"
  console.log(meta?.direction); // "forward" | "back" | "unknown"
  console.log(meta?.userInitiated); // true if user clicked back/forward/link
  console.log(meta?.sourceElement); // Element | null
  console.log(meta?.info); // data passed via navigation.navigate({ info })
});

// In guards (browser-initiated navigation)
// Available on toState.context.navigation — written in onTransitionStart
```

Meta is frozen via `Object.freeze()` for subscriber mutation protection.

### NavigationMeta type

| Field            | Type                                            | Description                                               |
| ---------------- | ----------------------------------------------- | --------------------------------------------------------- |
| `navigationType` | `"push" \| "replace" \| "traverse" \| "reload"` | Type of navigation                                        |
| `userInitiated`  | `boolean`                                       | Whether the user clicked back/forward/link                |
| `direction`      | `"forward" \| "back" \| "unknown"`              | Direction in the history stack                            |
| `sourceElement`  | `Element \| null`                               | DOM element that initiated the navigation                 |
| `info`           | `unknown`                                       | Ephemeral data passed via `navigation.navigate({ info })` |

### Claim-based API internals

The plugin claims the `"navigation"` namespace via `api.claimContextNamespace("navigation")`:

- `claim.write(state, meta)` — attaches frozen `NavigationMeta` to `state.context.navigation`
- `claim.release()` — called in `teardown` to release the namespace

### Core vs Plugin signals — `state.transition` vs `state.context.navigation.navigationType`

`state.transition.{replace, reload, redirected}` (core, portable) and `state.context.navigation.navigationType` (this plugin, browser-specific) **complement** each other. They measure different things from different sources, so they coexist — neither deprecates the other.

| Layer  | Field                                            | Source                                                                                                                             | Availability                                |
| ------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Core   | `state.transition.{replace, reload, redirected}` | `NavigationOptions` passed to `router.navigate(...)` (or auto-modified by `forceReplaceFromUnknown` / `navigateToNotFound`)        | Always, under any URL plugin (or no plugin) |
| Plugin | `state.context.navigation.navigationType`        | Platform Navigation API event (`event.navigationType`) or History-stack derivation — how the **browser** classified the navigation | Only under `@real-router/navigation-plugin` |

Semantic coverage at a glance:

| Question                                | Core portable signal                                      | Plugin signal (this plugin only)                         |
| --------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| Was this a replace transition?          | `state.transition.replace === true`                       | `state.context.navigation.navigationType === "replace"`  |
| Was this a reload transition?           | `state.transition.reload === true`                        | `state.context.navigation.navigationType === "reload"`   |
| Was this a redirect transition?         | `state.transition.redirected === true`                    | (no plugin signal — core-level concept)                  |
| Was this a traverse (browser back/fwd)? | **Not covered** — traverse has no `opts.replace`/`reload` | `state.context.navigation.navigationType === "traverse"` |
| Was this a push?                        | By elimination — none of the above flags                  | `state.context.navigation.navigationType === "push"`     |

Rule of thumb: read `transition.replace` (and `reload`/`redirected`) when you want to know **what the caller asked for** (or what core auto-modified) — portable across URL plugins. Read `state.context.navigation.navigationType` when you need to know **how the Navigation API classified** the transition, including browser-driven `traverse`/`reload` events that don't flow through `router.navigate` options.

Concrete consumer of both: `shared/dom-utils/scroll-restore.ts` reads `route.transition.reload || nav?.navigationType === "reload"`. The core arm covers programmatic reload (`router.navigate({reload:true})`); the plugin arm covers F5/cross-document via the [Cross-document Activation Priming](#cross-document-activation-priming-531) flow (`getActivationType()` primes `nav.navigationType === "reload"` while leaving `opts.reload` undefined on the initial transition). Dropping either side silently regresses one of the cases.

## State in NavigationHistoryEntry

```typescript
entry.getState() = {
  name: "users.view",
  params: { id: "123" },
  search: { tab: "posts" },
  path: "/users/123?tab=posts",
};
```

Note: since RFC-4 M2 (#1548) the buffered state carries a dedicated `search`
(query) channel alongside path-only `params` — `search` is a frozen `{}` when the
route has no query.

Note: no `meta` field (unlike browser-plugin's `history.state`). Navigation metadata lives on `state.context.navigation`, not in browser history state.

## Module Structure

```
src/
├── plugin.ts              — NavigationPlugin class (claim-based context API, wires NavigationBrowser with URL logic)
├── factory.ts             — navigationPluginFactory (validation, browser creation, instance creation)
├── types.ts               — Types (NavigationPluginOptions, NavigationBrowser, NavigationMeta, NavigationDirection, NavigationSharedState)
├── history-extensions.ts  — Navigation API history extensions (peekBack, peekForward, hasVisited, etc.)
├── navigate-handler.ts    — Navigate event handler (createNavigateHandler, recoverFromNavigateError); checks `event.info === PLUGIN_SYNC_INFO` to short-circuit plugin-originated events
├── navigation-browser.ts  — NavigationBrowser implementation (createNavigationBrowser wraps globalThis.navigation, tags every router-driven mutation with `info: PLUGIN_SYNC_INFO`); exports PLUGIN_SYNC_INFO sentinel
├── href-utils.ts          — isSameHref(target, currentHref) pure helper backing the same-URL guard in onTransitionSuccess (#580)
├── ssr-fallback.ts        — createNavigationFallbackBrowser (no-op fallback for SSR)
├── validation.ts          — Options validation (delegates to createOptionsValidator from browser-env)
├── constants.ts           — Constants (defaultOptions, source, LOGGER_CONTEXT)
├── index.ts               — Public exports + module augmentation (@real-router/types for StateContext, @real-router/core for Router)
└── browser-env/           — Symlink to shared/browser-env (extractPath, buildUrl, urlToPath, shouldReplaceHistory, normalizeBase, createStartInterceptor, createReplaceHistoryState, etc.)
```

### Key dependency: `browser-env` (partial reuse)

navigation-plugin reuses URL and environment utilities from the private `browser-env` package:

- `normalizeBase` — base path normalization in factory
- `safelyEncodePath` — path encoding in `navigation-browser.ts`
- `safeParseUrl` — URL parsing (used internally by `urlToPath` in browser-env)
- `shouldReplaceHistory` — push vs replace decision in `plugin.ts`
- `isBrowserEnvironment` — environment detection in factory
- `createWarnOnce` — SSR warning in `ssr-fallback.ts`
- `createOptionsValidator` — options validation
- `createStartInterceptor` — `router.start()` path injection (shared across browser-plugin/hash-plugin/navigation-plugin via the structural `LocationSource` type)
- `createReplaceHistoryState` — `router.replaceHistoryState(...)` extension (shared via the structural `ReplaceStateBrowser` type — works with both `Browser` and `NavigationBrowser`)

Unlike browser-plugin, navigation-plugin does **not** use `createSafeBrowser`, `createPopstateHandler`, `createPopstateLifecycle`, `updateBrowserState`, or `isStateStrict` from browser-env — those are History API specific.

## Router Extensions

Plugin uses `api.extendRouter()` to register all extensions. The returned unsubscribe function is called in `teardown`. Navigation metadata is delivered via `state.context.navigation` (claim-based API), not via a router extension.

### Compatible extensions (same as browser-plugin)

| Method                                                    | Returns              | Description                                                                                                                                                                                                  |
| --------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `buildUrl(name, params?, search?, options?: { hash? })`   | `string`             | Build full URL with base path. Query channel at position 3 (RFC-4 M2, #1548); options shift to 4. Optional `hash` (decoded, no leading `#`) is encoded via `encodeURI(s).replace(/#/g, "%23")` and appended. |
| `matchUrl(url)`                                           | `State \| undefined` | Parse URL to router state                                                                                                                                                                                    |
| `replaceHistoryState(name, params?, search?, options?: { hash? })` | `void`               | Update browser URL without triggering navigation. Tri-state `hash`: `undefined` preserves, `""` clears, value sets.                                                                                          |

### Exclusive extensions (Navigation API only)

| Method                          | Returns              | Description                                    |
| ------------------------------- | -------------------- | ---------------------------------------------- |
| `peekBack()`                    | `State \| undefined` | State of the previous history entry            |
| `peekForward()`                 | `State \| undefined` | State of the next history entry                |
| `hasVisited(routeName)`         | `boolean`            | Whether any history entry matches the route    |
| `getVisitedRoutes()`            | `string[]`           | Unique route names across all history entries  |
| `getRouteVisitCount(routeName)` | `number`             | How many history entries match the route       |
| `traverseToLast(routeName)`     | `Promise<State>`     | Navigate to the last history entry for a route |
| `canGoBack()`                   | `boolean`            | Whether there's a previous history entry       |
| `canGoForward()`                | `boolean`            | Whether there's a next history entry           |
| `canGoBackTo(routeName)`        | `boolean`            | Whether any previous entry matches the route   |
