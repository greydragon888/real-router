# @real-router/navigation-plugin

> Navigation API integration for browser URL synchronization

## Options

```typescript
navigationPluginFactory({
  forceDeactivate: false, // default: false — run canDeactivate on back/forward. Set true to bypass.
  base: "/app", // default: "" — base path for all routes
});
```

Same two options as `browser-plugin`. Plugins are interchangeable at the options level — literally: both read `sharedUrlPluginDefaults` (`shared/browser-env/defaults.ts`), as does `hash-plugin`, because "does Back honour `canDeactivate`" is one product decision, not three (the former copies drifted and the drift reached users: #524 → #1645).

## Navigation Flow

```
Router Navigation:
  navigate() → Promise<State> → onTransitionSuccess → navigation.navigate()

Browser Navigate Event:
  navigate event → handler → api.navigateToState()/navigateToNotFound()/$$error
                           → or no intercept: the browser performs it (see Gotchas)
                 (with precommit handlers, a navigation that leaves the document
                  is redirected to the router's URL before its commit, #2751)
```

### Promise-Based API

All navigation methods return `Promise<State>`:

- `router.start(path?)` — path made optional via `createStartInterceptor` which injects `browser.getLocation()` when no path given
- `api.navigateToState()` — what the navigate handler calls for a matched URL, inside `withRecovery`
- `router.navigateToNotFound(path?)` — called when `allowNotFound: true` and a navigate event that stays in this document has a URL no route matches (synchronous, returns `State`)
- `allowNotFound: false` + an unmatched URL that stays in this document — the plugin emits `$$error` with `ROUTE_NOT_FOUND` via `api.emitTransitionError()`, takes the browser back to the entry the navigation started from, and throws in the `event.intercept()` handler (#2740). No silent `navigateToDefault()` fallback (see #483)

## Gotchas

### Navigations the browser performs are not intercepted (#2724)

`handleNavigateEvent` returns without `event.intercept()`, and the browser performs the navigation as it does under browser-plugin (which listens to `popstate` only), for:

- a download (`event.downloadRequest`) or a POST form submission (`event.formData`), whatever the URL;
- a reload (`navigationType === "reload"`) — `location.reload()` and `navigation.reload()` reload the document. The browser's own reload button fires no interceptable event at all;
- a navigation that would load a new document (`destination.sameDocument === false`) to a URL no route matches — a link, `location.assign()` / `replace()`, `navigation.navigate()`, a GET form.

These checks run before the handler reads the navigation's metadata, so none of these navigations stages a record. So `canDeactivate` is never consulted for these, and strict mode raises no `ROUTE_NOT_FOUND` for them. A same-document navigation to an unmatched URL — `history.pushState`, a traverse inside the document — is still the router's. `tests/functional/browser-owned-navigations-2724.test.ts` owns the table, on a `MockNavigation` whose `destination.sameDocument` follows the channel.

**A download aborts a navigation the router is still taking.** The browser aborts the pending intercepted navigation when the download starts, so its URL stays committed while the router stays put, and `withRecovery` leaves `TRANSITION_CANCELLED` to a newer navigation the router never sees. The handler remembers the signal of the last navigation it took and the entry that navigation started from; a download that finds the signal aborted takes the browser back to that entry on the next task (#2740) — a navigation started during the download's own event cancels the download (measured on Chromium 153). Every navigation the plugin starts itself clears the remembered signal — `router.replaceHistoryState()` starts one — so a URL it wrote is never taken back, and a router stopped by then takes nothing back.

### Overlapping Navigations

The Navigation API keeps one ongoing navigation: a new one aborts it, and its `event.signal` cancels the router's transition. No deferred queue is needed (unlike browser-plugin's popstate handling). A refused navigation that arrives while the router was still taking the aborted one returns to that one's origin — see the section below.

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

The two differ on more than the base. **`buildUrl` resolves `forwardTo`; `buildPath` does not** (#2250) — on a source `old → fresh`, `buildUrl("old")` prints the target's URL and `buildPath("old")` prints `/old`. A URL is where the click lands, so the plugin door — the shared `createPluginBuildUrl` — resolves the chain through `forwardState` and prints with `buildPathResolved`, one pass of the chain (#2260); it does not ask `buildNavigationState`, whose `reportUndeclaredParamKey` is advice about a state you are about to persist (#2248). `buildPath` is LITERAL by record (core INVARIANTS `makeState` row 8), which is what lets a plugin build a state for an alias without being teleported off it.

### Hash Fragment Support (#532)

URL fragments are first-class state, owned by the plugin (not by core). Stored decoded in `state.context.url` (shared namespace claimed by both URL plugins; mutually exclusive with `@real-router/hash-plugin` at runtime).

- **State namespace**: `state.context.url = { hash: string; hashChanged: boolean }` — hash is decoded, no leading `#` (symmetric to params). `hashChanged` is `true` when the committed hash differs from the previous transition's `state.context.url.hash` — any hash change, browser-driven (`event.hashChange`) or programmatic (`navigate({ hash })`).
- **Tri-state `opts.hash`** in `router.navigate(name, params, search?, { hash })` (options at position 4, #1548): `undefined` preserves current hash, `""` clears, non-empty value sets. Same widening on `router.buildUrl` and `router.replaceHistoryState`.
- **Browser-driven hash-only click**: `navigate-handler.ts` reads `event.hashChange` and forwards `{ force: true, hashChange: true, hash }` to `api.navigateToState` — bypasses core's `SAME_STATES` rejection. Subscribers disambiguate via `state.context.url.hashChanged`, not via the overloaded `force` flag.
- **Recovery paths preserve hash**: a refused navigation returns to the entry it started from, whose URL carries its own fragment; the rewrite a refused `replace` takes, `syncUrlToRouterState`, reads `currentState.context.url.hash` to rebuild the URL — without this, `CANNOT_DEACTIVATE` would silently strip the fragment.
- **F5 / cold-load: lazy read in `onTransitionSuccess`**. When `opts.hash` is omitted, `onTransitionSuccess` reads the destination fragment with `getDecodedHash(browser)` — on the first transition as on every later one; the previous hash comes from `fromState.context.url.hash`. **NOT in the constructor** — by the time `onTransitionSuccess` fires, `location.hash` already reflects the destination URL, so F5 on `/page#section` is recovered without explicit priming. This is **separate** from the `navigationType` priming via `getActivationType()` documented in "Cross-document Activation Priming" — that priming is Navigation-API-only metadata and does not touch the URL fragment.

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

### A refused navigation returns to the entry it started from (#2740)

The Navigation API commits an intercepted navigation before its handler runs and does not roll it back when the handler rejects — measured on Chromium 153, the URL and the entry stay where the navigation put them. When the router refuses — a guard, `ROUTE_NOT_FOUND`, a crash inside the transition — `returnToOrigin` in `navigate-handler.ts` takes the browser back with `browser.traverseTo` to the entry the router stands on. That is the entry the navigation started from — `handleNavigateEvent` reads its key off `browser.currentEntry` before the commit — unless an earlier navigation the router took has not brought it to its destination — cancelled by this one, or still running: the browser has committed that one's entry, unless a redirect held it before the commit (#2751), and the router has not moved, so this one inherits that one's origin. "Has not moved" is the router's state object: a commit makes a new one, and a navigation that reaches the router's own state (`SAME_STATES`) drops the inherited origin. A navigation that reaches its destination drops its own record only: one the browser started after the commit, before the handler resumed, keeps its record and the origin it inherits. The return moves no entry: the page a refused Back left behind is still one Back away. The traversal carries `PLUGIN_SYNC_INFO`, so it reaches no router transition.

A refused push leaves its own entry one step ahead of the origin, and the next push from the origin replaces it. Until then the history extensions see it: `canGoForward()` is `true`, `peekForward()` returns the refused route, and the visit counts include it.

A refused `replace` keeps the key of the entry it replaced, so origin and destination are one entry, and `syncUrlToRouterState` rewrites it — `browser.navigate({ history: "replace" })` to the current router state. So does a recovery that finds no origin entry — e.g. a custom `NavigationBrowser` with no `currentEntry` — or whose `traverseTo` throws, which is logged as `Failed to return to the entry the navigation started from`. A navigation the router committed between the refusal and the recovery — a redirect a `TRANSITION_ERROR` listener queues — owns the URL, and nothing is written. Nor is anything written while the browser stands on the very entry the router stood on — its `id`, which a `replace` changes while the key stays: a navigation a redirect held, cancelled before its commit by a download, never left it (#2751). A custom browser whose entries carry no id is judged by the key alone, and the entry's URL must match too, for one whose ids a `replace` keeps. An entry whose URL already is the router's is left alone, as `onTransitionSuccess` leaves it (#580).

That rewrite carries the query channel: its URL is the state's own `path`, as `onTransitionSuccess` writes it — the query included, and a trailing slash `trailingSlash: "preserve"` keeps, which a rebuild from the route name drops — and the buffered entry state carries `search`. Drop either and recovery becomes the one writer producing a narrower entry than every other (#1586) — a blocked navigation away from `?tab=a` leaves the user on the bare path while `state.path` still holds the query.

`withRecovery` handles the two error classes:

- **Non-`RouterError`** (unexpected crashes) → `recoverFromNavigateError` — logs `Critical error in navigate handler` + `returnToOrigin`; the intercept rejects with the error.
- **`RouterError`** — `TRANSITION_CANCELLED` while another navigation owns the URL → nothing, and the intercept resolves. The owner is a newer navigation the browser started — the handler took it, or a download cleared the handler's record — or a router navigation announced while this one ran and neither refused nor cancelled since (`watchNewerNavigations`, `browser-env`). With none — a guard cancelled this navigation quietly (#933) — `returnToOrigin`, and the intercept rejects, as for a refusal (#2796). `SAME_STATES` → `syncUrlToRouterState` for an entry at another path or query than the router's (#2744), and the intercept resolves — a navigation the handler redirected stands on the router's URL already, and the write ends any other: its `finished` rejects with `AbortError`, and the plugin asks for the scroll the browser skipped (#2751); a `SAME_STATES` navigation a newer one has aborted writes nothing, and the intercept resolves; any other code (guard refusal, `ROUTE_NOT_FOUND`, …) → `returnToOrigin`, no logging, and the intercept rejects with the refusal. Router already emitted `TRANSITION_ERROR` / `TRANSITION_CANCEL` — observers can subscribe there.

**The intercept rejects after a return, so the browser applies no scroll.** A navigation whose handler resolves has the browser restore the scroll position of the entry it reached onto the page the router stayed on — measured on Chromium 153 for a refused Back. So `finished` of a refused navigation rejects and `navigateerror` fires. The browser marks `finished` as handled: a caller that does not await it sees no `unhandledrejection` (measured on Chromium 153; `MockNavigation` does the same).

The not-found arm returns the same way and rejects too: `navigateToNotFound` refused by `canDeactivate` (`CANNOT_DEACTIVATE`) and strict mode's `ROUTE_NOT_FOUND`. `tests/functional/refused-navigation-returns-2740.test.ts` owns the table of arcs; `tests/property/refused-navigation.properties.ts` holds the class.

**A route the router keeps refusing to enter turns Back away each time.** An entry whose route a `canActivate` guard closes for good — an authenticated page after logout — stays in history, and every Back onto it returns; the user steps past it from the browser's history menu.

**The handler runs no transition in a `precommitHandler`.** A transition run there commits before the browser does, so `router.subscribe` sees the previous URL after every navigation the browser starts and the router allows (measured on Chromium 153). A traversal without a user activation cannot take one, and a released Safari has none, so the return would stay anyway. IMPLEMENTATION_NOTES "URL Plugins: a Refused Navigation Returns to the Entry It Started From (#2740)" records the measurement. The precommit handler the plugin does pass only redirects a navigation to the router's URL — see "A navigation the router rewrites gets the browser's scroll (#2751)".

See #524 for why the "swallow silently" path was broken (URL committed, router state frozen, observable desync).

### Router-driven mutations re-enter the navigate handler (#518, #580)

`nav.navigate(...)` and `nav.traverseTo(...)` fire navigate events. Chromium delivers them synchronously inside the call; Safari 26.2 WKWebView delivers them on a subsequent task (#580 — render-loop in Tauri release on macOS 26.2). The handler must short-circuit events fired by the plugin's own writes regardless of delivery timing — otherwise it treats those events as user-initiated and re-issues `router.navigate(...)` in a loop.

Mechanism: `createNavigationBrowser` (`navigation-browser.ts`) tags every router-driven mutation with `info: PLUGIN_SYNC_INFO` — a stable string sentinel exported alongside it. The handler in `navigate-handler.ts` checks `event.info === PLUGIN_SYNC_INFO` at entry and intercepts with a noop handler. The bare `return` is not enough — per Navigation API spec, a same-origin `canIntercept` event left un-intercepted triggers Chromium's cross-document fallback (full reload). The noop intercept cancels the fallback without running router logic; state was already committed by the synchronous call site.

Why `info` rather than a synchronous flag: identity travels with the event, so the check is timing-independent — a flag raised around the call is already lowered by the time WKWebView delivers the event on a later task. `updateCurrentEntry` is **not** tagged: it dispatches `currententrychange`, not `navigate`, so there is no event to short-circuit.

Consumers supplying a custom `NavigationBrowser` must pass `PLUGIN_SYNC_INFO` as `info` in their `nav.navigate` / `nav.traverseTo` calls (the constant is exported from the package barrel) — otherwise the handler will treat plugin-driven events as user-initiated under any browser. The built-in factory path (`createNavigationBrowser` and `createNavigationFallbackBrowser`) does this automatically.

### Error Recovery

`recoverFromNavigateError` in `navigate-handler.ts` takes the browser back to the entry the navigation started from on a non-`RouterError` exception, as a refusal does (see above).

### A navigation's record belongs to the transition it starts (#2753, #2754)

A record is the metadata `state.context.navigation` publishes and, for `traverseToLast`, the entry the browser traverses to. It is staged for the length of the router call that starts the navigation, and core announces the transition within that call. `#stage` stages it for the transition `api.navigateToState()` (the handler) or `router.navigate()` (`traverseToLast`) starts; `#stageCommit` stages it for the commit `router.navigateToNotFound()` (the handler's not-found arm) makes without a transition:

- `onTransitionStart` takes the transition's record and files it under `toState.context`; guards read the metadata there. Every navigation's state gets a `context` of its own, and a transition commits a state carrying the one its start hook received (`completeTransition` spreads it), so `onTransitionSuccess` finds the record that transition took and no other — whichever navigation superseded it, whichever unrelated call was refused, whichever events core did not deliver in between. The plugin has no cancel or error hook: a cancelled or refused transition's record is never looked up again.
- A success the plugin heard no start for — a commit that starts no transition, `navigateToNotFound()` among others, or a transition whose start core did not deliver to it — takes the record `#stageCommit` holds, or the activation's. `onTransitionStart` never reads a commit's record, so a transition a `canDeactivate` guard starts inside `navigateToNotFound()` publishes none of it.
- A record no transition took is dropped when its call returns: core refused the navigation without starting one — at the facade, as `SAME_STATES`, on an aborted signal, on a router that has not started, or by `canDeactivate` in `navigateToNotFound()`, among others. A commit's record is dropped when its call returns either way. `#stage` and `#stageCommit` put back what the slot held, so a navigation nested in another's call — one the browser handles synchronously inside a hook or a guard — leaves the outer record in place.
- `onStart` drops a staged transition record: a router that starts during a staging call was restarted from code that call ran before its own transition started — core refuses a restart from a router notification there, not from the logger's callback — and its start transition is not the call's.
- The boundary: a commit an app makes during the plugin's not-found call — `navigateToNotFound()` from a `canDeactivate` guard — takes that call's record: the slot cannot tell it from the plugin's own commit.

**Refused by core: a navigation an app starts from inside a router notification.** That covers a listener and the abort handler of the navigation a call supersedes, and a `stop()` + `start()` restart there too: core throws `REENTRANT_NAVIGATION` (#2778). A listener's `stop()` alone is allowed: the call's navigation ends, or never starts, and its record reaches no later navigation. The cells that try a restart from a listener pin the refusal and what the plugin publishes after it.

The activation record waits in a slot of its own for the router's first transition or commit (see "Cross-document Activation Priming").

`tests/functional/transition-record-2753-2754.test.ts` owns the tables: a navigation that supersedes a held `router.navigate()` or `traverseToLast()` ends as it ends alone, a refusal leaves the transition in flight its record, no navigation takes a record staged for another, and the activation's record reaches the router's first transition or commit.

### NavigationMeta Undefined in Guards During Programmatic Navigation

For programmatic navigation (`router.navigate()`), meta is written in `onTransitionSuccess`. Guards run before that, so `toState.context.navigation` is `undefined`. For browser-initiated navigation, meta is written in `onTransitionStart` — available in guards.

Exception — first transition after a cross-document load: the constructor stages a record from `navigation.activation.navigationType` for it, so guards on the very first transition do see `toState.context.navigation` (with `userInitiated: false`, `direction: "forward"` for `push` else `"unknown"`). See "Cross-document Activation Priming" below.

### Cross-document Activation Priming (#531)

On F5, browser back/forward across the JS context boundary, or a fresh URL bar entry, the prior JS context is destroyed. The `navigate` event handler in `onStart` never sees the activation event. Without priming, `deriveNavigationType` falls through to `"replace"` for every initial transition — breaking scroll restoration on reload (#497) and any consumer branching on `state.context.navigation.navigationType`.

The plugin reads `navigation.activation.navigationType` ([Baseline 2026](https://html.spec.whatwg.org/multipage/nav-history-apis.html#dom-navigationactivation-navigationtype): Chrome 123+, Firefox 147+, Safari 26.2+) **once in the constructor** via `browser.getActivationType()` and stages a record from it for the router's first transition — or for its first commit, when `start()` lands on a URL no route matches. The first transition start or commit the plugin hears takes it, and keeps it if that transition then fails. A `start()` refused before it begins a transition leaves the record to the next `start()`, and so does a `traverseToLast()` refused before the router starts. The constructor stages it only when `router.getState()` and `router.getPreviousState()` are both `undefined`: a plugin installed after the router's first commit, or after a `stop()` since, stages none. A start that ends without a commit — refused, or stopped before it lands — leaves the previous state `undefined`, and a plugin installed then stages it. Later transitions derive their metadata with `deriveNavigationType`.

Limitations:

- `userInitiated` is always `false` — the browser does not expose whether F5 came from a key press or `location.reload()`.
- `direction` for `traverse` is `"unknown"` — direction-from-activation (`from.index` vs. `entry.index`) is a possible follow-up; the conservative `"unknown"` matches the issue's acceptance criteria #4.
- Browsers without `navigation.activation` (Chrome 102–122, custom `NavigationBrowser` mocks) get `getActivationType() === undefined` — the plugin falls back to the legacy `deriveNavigationType` path. Acceptable for the sub-2% Chromium tail.

### UNKNOWN_ROUTE: updateCurrentEntry, Not navigate

When `navigateToNotFound` is called, the plugin uses `browser.updateCurrentEntry()` (not `browser.navigate()`). The URL remains unchanged — only the entry state is updated.

### Same-URL guard in onTransitionSuccess (#580)

When the target URL of a transition is canonically equal to the browser's current URL — for example the initial transition into a route whose path already matches the bootstrap URL, or `router.navigate(name, params, undefined, { reload: true })` to the current state — the plugin writes router state via `browser.updateCurrentEntry({ state })` instead of `browser.navigate(url, { history: "replace" })`. Both leave a single history entry with the new state, but `updateCurrentEntry` does not fire a navigate event.

This avoids two problems:

- **Chromium**: a same-URL `nav.navigate({history:"replace"})` would still fire a navigate event the handler must short-circuit via `event.info === PLUGIN_SYNC_INFO`. `updateCurrentEntry` skips that round-trip.
- **Safari 26.2 WKWebView under custom protocols** (`tauri://`, `app://`): same-URL `nav.navigate({history:"replace"})` is treated as a **cross-document** navigation. The JS context is discarded, the bootstrap re-runs, the plugin re-issues the call, and the cycle becomes a render-loop the user perceives as flicker (#580). The guard bypasses the broken code path entirely.

Comparison is via `isSameHref(finalUrl, browser.currentEntry?.url)` (`href-utils.ts`) — both URLs are run through the `URL` constructor so `scheme://host` and `scheme://host/` (special-scheme trailing-slash canonicalisation) compare equal. When `currentEntry?.url` is null or malformed the guard returns `false` and the plugin falls back to the navigate path.

**Behavioural consequence**: a same-URL transition fires no navigate event. Observe state-only changes with `router.subscribe`; `state.context.navigation.navigationType` still reflects the logical type (`reload` / `replace`).

### A navigation the browser starts rewrites its own entry (#2744)

The browser commits an intercepted navigation's entry before the router runs. The router can land on another URL than the one the navigation was given — a `forwardTo` source, a trailing slash `trailingSlash: "never"` strips, a query `defaultSearch` adds, among others. In a browser with precommit handlers, a navigation that leaves the document is redirected to the router's URL before its commit (#2751, below); for any other navigation, and in a browser without them, two places give the entry the router's URL:

- **`onTransitionSuccess`**, when the URLs differ, picks push or replace with `shouldReplaceHistory`, as browser-plugin and hash-plugin do. Every transition the navigate handler starts for a matched URL carries `replace: true`, so the plugin rewrites the committed entry rather than pushing a second one. `navigationType` does not decide the write, and stays `"push"` for a push.
- **`withRecovery`**, on `SAME_STATES` — the router already shows that route — calls `syncUrlToRouterState` when the entry carries another path or query, as the History API plugins resync on `SAME_STATES`. An entry at the router's own path and query is not written: a fragment-only difference is the page's, and a same-URL replace is a cross-document navigation in WKWebView (#580). A navigation a newer one has aborted writes nothing and keeps the newer one's record, as for `TRANSITION_CANCELLED`: the write would abort the newer one.

A fragment the router has not published forces a transition on the route it shows: the handler adds `force` and `hashChange` for the browser's fragment-only navigation (`event.hashChange`) and for an alias of that route with another fragment. Without it, `/old#part` from `/users/list` would end in `SAME_STATES` and lose `#part`. A fragment that changes on the router's own path and query — a third party's `history.replaceState(null, "", "#x")`, for which `event.hashChange` is `false` (measured on Chromium 153) — starts no transition and is not rewritten.

`tests/helpers/rewrittenUrls.ts` holds the table of rewrites; `tests/functional/browser-push-rewritten-url-2744.test.ts` owns the arcs and fragments over it; `tests/property/history-model.properties.ts` holds the push of a `forwardTo` source under random sequences.

### A navigation the router rewrites gets the browser's scroll (#2751)

The plugin's write of the router's URL after the transition is a navigation of its own: it aborts the browser's navigation — `navigateerror` with `AbortError`, `finished` rejects — and the browser skips the scroll it applies when a navigation finishes: to the top, to the fragment, or, for a traversal, to the position the entry held (measured on Chromium 153, Firefox 155 and WebKit 26.6). Two helpers in `navigate-handler.ts` keep that scroll:

- **`redirectBeforeCommit`** gives a navigation that leaves the document (`destination.sameDocument === false`: a link, a GET form, `navigation.navigate()`, `location.assign()` or `replace()`) a `precommitHandler` that redirects it to `buildEntryUrl(matchedState.path, normalizeHashInput(hash), base)`. `matchPath` has applied `forwardTo` and the defaults, and the transition commits that state; `buildEntryUrl` (`href-utils.ts`) is the builder `onTransitionSuccess` writes with, and the fragment is the one it publishes. So the write finds the entry at its own URL and takes the same-URL path (#580), and nothing aborts the navigation. A `redirect()` that throws is caught: a precommit handler that throws cancels the navigation outright. A router still starting gets no redirect: its start can settle in the microtask the redirect holds the commit — a start route's guard that navigates the browser and refuses — and the navigation would no longer supersede it: `start()` rejected with the refusal instead of `TRANSITION_CANCELLED` (measured on Chromium 153, Firefox 155 and WebKit 26.6). MDN lists precommit handlers in Chrome 141 and Firefox 147, and in no released Safari; a browser without them ignores the option (measured on Chromium 139).
- **`scrollIfAborted`** covers the navigations a redirect does not reach: `history.pushState()` and `replaceState()` — with a precommit handler they return before the URL changes —, a traversal, which `redirect()` refuses, every navigation in a browser without precommit handlers, and one made while the router starts. When the transition has arrived — or `navigateToNotFound()` has — and the navigation's signal is aborted, by the plugin's write or by the app's as the router lands, it calls `event.scroll()`, which the browser honours on an aborted navigation. A navigation a newer one aborted before its handler ran gets none: the newer one owns the scroll.

A redirected navigation commits one microtask after the call that starts it, and its transition starts then; without the redirect both happen within the call (measured on Chromium 153, Firefox 155 and WebKit 26.6). In between it is a pending navigation, so a newer navigation or a download cancels it before its commit, and its entry never appears. A router navigation started in that window runs first; one an async guard still holds when the redirected navigation commits is superseded by it — `navigation.navigate("/old"); router.navigate("about")` ends on `/old`'s route, where it ended on `about`. The handler reads the navigation's metadata off the event, whose origin entry the commit replaces, and stages it for the router call it makes, so a router navigation in the window does not publish it — see "A navigation's record belongs to the transition it starts".

A traversal onto an entry whose URL the router rewrites gets its position back in Chromium only; Firefox and WebKit end at the top (measured on Firefox 155 and WebKit 26.6).

`event.scroll()` scrolls even when another listener intercepted the navigation with `scroll: "manual"`, which the event does not report, and a navigation scrolls once: that listener's own `event.scroll()` afterwards throws `InvalidStateError` (measured on Chromium 153, Firefox 155 and WebKit 26.6).

`MockNavigation` runs precommit handlers before the commit and commits at the URL a handler redirected to; `disablePrecommit()` makes it ignore them, and a traversal takes none — it cannot be cancelled. A `replace` keeps the entry's key and gives it a new id. `mock.scrolls` records each scroll the browser applies: after the handlers of a navigation nothing aborted and nobody set to `scroll: "manual"`, or on `event.scroll()`. `tests/functional/rewritten-url-scroll-2751.test.ts` owns the table, with precommit handlers and without; `tests/property/history-model.properties.ts` asserts one scroll per push, `history.pushState()`, Back and Forward the router takes.

### History Extensions Use URL Matching (Not entry.getState())

`peekBack`/`peekForward`/`hasVisited`/`getVisitedRoutes`/`canGoBackTo` use URL matching to resolve `NavigationHistoryEntry` → `State`. They do NOT read `entry.getState()`. Reason: entries before plugin init have no state; entries may be stale after route reconfiguration; entries from other SPAs have foreign state.

### Explicit `replace: false` on first navigation → push

`router.navigate(name, params, undefined, { replace: false })` before any successful navigation creates a **push** entry (not replace): `shouldReplaceHistory` replaces a first navigation only when `replace !== false`. Omit `replace` (or set `true`) if you want replace-on-first behavior.

### replaceHistoryState hash semantics

`replaceHistoryState(name, params, search?, options?)` accepts a `search` query channel (position 3, RFC-4 M2 #1548) and an optional `{ hash }` field with the same tri-state semantics as `router.navigate` (undefined preserves, `""` clears, value sets). When omitted, current `browser.getHash()` is preserved — symmetric with `onTransitionSuccess`.

**Both halves of the call come from the resolved state (#1585).** `replaceHistoryState`
resolves the target through `buildNavigationState` and then uses that state
VERBATIM — as the entry's state record AND, through its `path`, as the input to
`buildUrl`. Building the URL from the caller's raw arguments instead reaches a
plain `buildPath` — no `forwardTo` resolution, no `forwardState` seam — so the pair
disagrees about the very keys the seam contributes: a `persistent-params`
injection lands in the record and not in the URL beside it, and a forwarding
route writes the source name in the URL and the target in the record. The shared
factory does not re-make the state through `api.makeState` — the resolved state
already carries the path, so a rebuild would be redundant work per history record.

### traverseToLast Excludes Current Entry

`traverseToLast(routeName)` finds the last entry matching `routeName`, but excludes the current entry to avoid `SAME_STATES`. Throws if the only matching entry is the current one.

It commits **both** channels of the entry it traverses to — `navigate(matchedState.name, matchedState.params, matchedState.search)`. With the query slot empty a traverse onto `/list?tab=a` commits `/list` while the browser sits on the full URL, and a second back/forward round trip disagrees with what is displayed (#1586). This is the output half of a pair whose input half is `entryToState` keeping `url.search` before matching (#449): `matchedState` is already correct there, which is why an assertion stopping at it proves nothing.

## Navigation Metadata via State Context

The plugin claims **two** namespaces on `state.context`:

- `state.context.navigation` — `NavigationMeta` (this plugin only)
- `state.context.url` — `UrlContext = { hash, hashChanged }` (shared with `@real-router/browser-plugin`; mutually exclusive with `@real-router/hash-plugin`)

### Navigation Metadata

Navigation metadata is accessible via `state.context.navigation` (claim-based API):

```typescript
// In subscribe callbacks — the payload is { route, previousRoute }
router.subscribe(({ route }) => {
  const meta = route.context.navigation;
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

- `claim.write(state, meta)` — attaches `NavigationMeta` to `state.context.navigation`; the committed state's is frozen
- `claim.release()` — called in `teardown` to release the namespace

### Core vs Plugin signals — `state.transition` vs `state.context.navigation.navigationType`

`state.transition.{replace, reload, redirected}` (core, portable) and `state.context.navigation.navigationType` (this plugin, browser-specific) **complement** each other. They measure different things from different sources, so they coexist — neither deprecates the other.

| Layer  | Field                                            | Source                                                                                                                                                                                                | Availability                                |
| ------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Core   | `state.transition.{replace, reload, redirected}` | `NavigationOptions` passed to `router.navigate(...)` (`replace` — and only `replace` — is also auto-modified, by `forceReplaceFromUnknown` / `navigateToNotFound`; `redirected` is never set by core) | Always, under any URL plugin (or no plugin) |
| Plugin | `state.context.navigation.navigationType`        | Platform Navigation API event (`event.navigationType`) or History-stack derivation — how the **browser** classified the navigation                                                                    | Only under `@real-router/navigation-plugin` |

Semantic coverage at a glance:

| Question                                | Core portable signal                                                  | Plugin signal (this plugin only)                         |
| --------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| Was this a replace transition?          | `state.transition.replace === true`                                   | `state.context.navigation.navigationType === "replace"`  |
| Was this a reload transition?           | `state.transition.reload === true`                                    | `state.context.navigation.navigationType === "reload"`   |
| Was this a redirect transition?         | **Not answerable** — `redirected` is only ever what the caller passed | (no plugin signal — core-level concept)                  |
| Was this a traverse (browser back/fwd)? | **Not covered** — traverse has no `opts.replace`/`reload`             | `state.context.navigation.navigationType === "traverse"` |
| Was this a push?                        | By elimination — none of the above flags                              | `state.context.navigation.navigationType === "push"`     |

Rule of thumb: read `transition.replace` (and `reload`/`redirected`) when you want to know **what the caller asked for** (or, for `replace` alone, what core auto-modified) — portable across URL plugins. Read `state.context.navigation.navigationType` when you need to know **how the Navigation API classified** the transition, including browser-driven `traverse`/`reload` events that don't flow through `router.navigate` options.

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

Note: the buffered state carries a dedicated `search` (query) channel alongside
path-only `params` (#1548) — `search` is a frozen `{}` when the route has no
query.

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
├── href-utils.ts          — buildEntryUrl(path, hash, base), the URL onTransitionSuccess, a recovery and the precommit redirect use (#2751); isSameHref(target, currentHref), the same-URL guard's comparison (#580)
├── ssr-fallback.ts        — createNavigationFallbackBrowser (no-op fallback for SSR)
├── validation.ts          — Options validation (delegates to createOptionsValidator from browser-env)
├── constants.ts           — Constants (defaultOptions = sharedUrlPluginDefaults from browser-env, source, LOGGER_CONTEXT)
├── index.ts               — Public exports + module augmentation (@real-router/core/types for StateContext, @real-router/core for Router)
└── browser-env/           — Symlink to shared/browser-env (extractPath, buildUrl, urlToPath, shouldReplaceHistory, normalizeBase, createStartInterceptor, createReplaceHistoryState, etc.)
```

### Key dependency: `browser-env` (partial reuse)

navigation-plugin reuses URL and environment utilities from `shared/browser-env/` (symlinked as `src/browser-env`):

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

| Method                                                             | Returns              | Description                                                                                                                                                                                                  |
| ------------------------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `buildUrl(name, params?, search?, options?: { hash? })`            | `string`             | Build full URL with base path. Query channel at position 3, options at position 4 (#1548). Optional `hash` (decoded, no leading `#`) is encoded via `encodeURI(s).replace(/#/g, "%23")` and appended. |
| `matchUrl(url)`                                                    | `State \| undefined` | Parse URL to router state                                                                                                                                                                                    |
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
