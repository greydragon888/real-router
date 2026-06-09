# @real-router/angular

## 0.11.2

### Patch Changes

- Updated dependencies [[`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae)]:
  - @real-router/core@0.56.0
  - @real-router/sources@0.8.5
  - @real-router/route-utils@0.2.3

## 0.11.1

### Patch Changes

- Updated dependencies [[`268dc3e`](https://github.com/greydragon888/real-router/commit/268dc3e7cb29e41f5f524f5644ad64be23eadde4)]:
  - @real-router/core@0.55.0
  - @real-router/sources@0.8.4

## 0.11.0

### Minor Changes

- [#695](https://github.com/greydragon888/real-router/pull/695) [`51b993e`](https://github.com/greydragon888/real-router/commit/51b993e7877e2b12f4e6ca0b8078f7ab4629501f) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix scroll restoration not firing on browser back/forward under navigation-plugin ([#694](https://github.com/greydragon888/real-router/issues/694))

  Since [#657](https://github.com/greydragon888/real-router/issues/657) lifted `replace` into `TransitionMeta`, a history **traversal** (back/forward) under `navigation-plugin` now arrives with `transition.replace === true` — a traversal reuses an existing history entry, which is replace-shaped at the history level. `createScrollRestoration` evaluated its replace-skip guard _before_ the back/traverse restore branch, so every back/forward navigation was swallowed and the saved scroll position was never restored.

  Reordered the restore decision tree so `reload` and `back`/`traverse` restore branches run **before** the genuine in-place-replace skip (`router.navigate({ replace: true })`, `navigateToNotFound` still skip as before).

  Also hardened restore for a custom `scrollContainer` that mounts or lays out a few frames after the navigation settles (heavy routes): restore now re-applies the scroll across a bounded frame budget until the container exists and the position sticks, instead of a single best-effort `scrollTo` that could clamp to 0 against not-yet-laid-out content.

- [#695](https://github.com/greydragon888/real-router/pull/695) [`51b993e`](https://github.com/greydragon888/real-router/commit/51b993e7877e2b12f4e6ca0b8078f7ab4629501f) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `scrollSpy` option to `provideRealRouter` / `provideRealRouterFactory` — router-coordinated `IntersectionObserver` URL hash spy ([#575](https://github.com/greydragon888/real-router/issues/575))

  New `scrollSpy?: ScrollSpyOptions` field on `RealRouterOptions` / `RealRouterFactoryOptions` wires `createScrollSpy(router, options)` from `shared/dom-utils/` via `provideEnvironmentInitializer` + the new shared `installScrollSpy` helper. The URL hash tracks the topmost visible anchor as the user scrolls, syncing `state.context.url.hash` so sibling `<a realLink [hash]>` highlights re-evaluate via the standard `createActiveRouteSource` pipeline.

  ```typescript
  bootstrapApplication(AppComponent, {
    providers: [
      provideRealRouter(router, {
        scrollSpy: { selector: "[id]:is(h2,h3)" },
      }),
    ],
  });
  ```

  Available on both `provideRealRouter` (SPA) and `provideRealRouterFactory` (SSR / SSG); on the SSR path the utility correctly NOOP's on the server pass (`document` is undefined). Teardown wired through `inject(DestroyRef)`. Options are a snapshot at bootstrap — not reactive to runtime changes.

  Emits a forced same-route transition with `{ hash, replace: true, force: true, hashChange: true }` — same write API as `<a realLink [hash]>` ([#532](https://github.com/greydragon888/real-router/issues/532)), `replace: true` so the spy doesn't pollute history. Three anti-flicker gates (`isTransitioning`, `coolingDown` cleared on `scrollend` or 500 ms fallback, `selfEmitting`).

  Requires `browser-plugin` or `navigation-plugin`. Under `hash-plugin` / `memory-plugin` / no URL plugin → warn-once + NOOP. SSR / browsers without `IntersectionObserver` = NOOP.

  The `dom-utils` git-tracked copy now also includes `scroll-spy.ts` (re-materialised from `shared/dom-utils/` via the `prebundle` script — ng-packagr does not follow symlinks).

  See [Scroll Spy guide](https://github.com/greydragon888/real-router/wiki/Scroll-Spy).

## 0.10.0

### Minor Changes

- [#658](https://github.com/greydragon888/real-router/pull/658) [`5313156`](https://github.com/greydragon888/real-router/commit/531315635e0635f1fe98975e74d3bb0d1e14421f) Thanks [@greydragon888](https://github.com/greydragon888)! - **BREAKING CHANGE (behaviour):** scroll-restoration disambiguation under `browser-plugin` ([#658](https://github.com/greydragon888/real-router/issues/658))

  `createScrollRestoration` (used by `provideRealRouter({ scrollRestoration })`) now disambiguates push, replace, and reload transitions under `@real-router/browser-plugin` using the portable `state.transition.replace` / `state.transition.reload` flags introduced in `@real-router/core`. Before this release the utility had no portable way to read `replace` under browser-plugin, so it called `scrollToHashOrTop` on **every** transition. After this release:
  - Programmatic replace (`navigate(..., { replace: true })`, OAuth callbacks, params canonicalization, `navigateToNotFound()`, auto-force-from-`UNKNOWN_ROUTE`) → **skip** (scroll position preserved)
  - Programmatic reload (`navigate(..., { reload: true })`) → **restore** from `sessionStorage`
  - Forward push (`realLink` without `replace`), browser back/forward (popstate), F5 cross-document → `scrollToHashOrTop` (unchanged)

  Under `@real-router/navigation-plugin` there is no behaviour change — every existing branch (`replace` / `reload` / `traverse` / `direction === "back"`) remains active.

  Opt-out for the legacy snap-on-every-transition behaviour: `scrollRestoration={{ mode: "top" }}`.

  This release also bundles the updated `transition.replace` core field; existing code reading `state.context.navigation.navigationType` is unaffected.

### Patch Changes

- Updated dependencies [[`5313156`](https://github.com/greydragon888/real-router/commit/531315635e0635f1fe98975e74d3bb0d1e14421f)]:
  - @real-router/core@0.54.0
  - @real-router/sources@0.8.3

## 0.9.0

### Minor Changes

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Angular post-hydration loader skip via TransferState bridge ([#599](https://github.com/greydragon888/real-router/issues/599))

  `provideRealRouterFactory` now bridges Angular's `TransferState` to the
  hydration scratchpad established by [#596](https://github.com/greydragon888/real-router/issues/596):
  - **Server pass** — after `await router.start(path)` resolves, the
    resulting state is serialized via `serializeRouterState(state)` and
    written to `TransferState` under `@real-router/angular:ssrState`.
    Angular's standard SSR pipeline (`provideClientHydration()` +
    `provideServerRendering()`) embeds the entry as `<script id="ng-state"
type="application/json">…</script>` in the response body.
  - **Client pass** — the same `provideAppInitializer` callback reads
    `TransferState`, finds the seeded JSON, and calls
    `hydrateRouter(router, ssrJson)` instead of `router.start(path)`.
    `hydrateRouter` deposits the parsed state into the one-shot
    scratchpad on `RouterInternals.hydrationState`, and `ssr-data-plugin`'s
    start interceptor reuses the server-resolved `state.context.data`
    without invoking the loader on first paint — parity with the other 5
    adapters that consume `<script>window.__SSR_STATE__</script>` in their
    `entry-client.tsx`.
  - **Pure CSR** — no TransferState seed and `inject(REQUEST, { optional:
true })` returns null; falls back to `router.start(path)` with no write.

  The TransferState key is internal — no public API surface change. Existing
  8 Angular examples (basic, combined, dynamic-routes, hash-routing,
  lazy-loading, nested-routes, persistent-params, animation-examples/\*)
  continue to use `provideRealRouter` for SPA scenarios; the bridge applies
  only to apps using `provideRealRouterFactory` together with
  `provideClientHydration()`.

  Verified end-to-end by `post-hydration loader skip ([#599](https://github.com/greydragon888/real-router/issues/599))` e2e in both
  `examples/web/angular/ssr-examples/ssr/` and
  `examples/web/angular/ssr-examples/ssr-streaming/` — counter on
  `window.__LOADER_CALLS__` stays empty after deep-link navigation, parity
  with the 5 cross-adapter baselines.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `provideRealRouterFactory` for SSR support ([#582](https://github.com/greydragon888/real-router/issues/582))

  New `provideRealRouterFactory({ baseRouter, plugins, deps })` API enables per-request router scope for Angular SSR (`@angular/ssr` + `outputMode: "server"`) and SSG build-time render via `renderApplication` + `platformProviders` `REQUEST` mock.

  The factory uses `useFactory` to clone the base router per request via Angular's `REQUEST: InjectionToken<Request | null>` token, runs `router.start(url)` through `provideAppInitializer`, and disposes the per-request router via `DestroyRef.onDestroy`. Conditional `plugins` function form supports browser-plugin server/client separation.

  Existing `provideRealRouter(router)` is unchanged — backward compatible. Both APIs ship in parallel; pick one for the entire application.

  See `packages/angular/CLAUDE.md` SSR Support section and RFC `.claude/rfc-angular-ssr-factory-ru.md`. Related parent issue: [#581](https://github.com/greydragon888/real-router/issues/581).

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `<client-only>` and `<server-only>` SSR-aware components ([#604](https://github.com/greydragon888/real-router/issues/604))

  Two paired components for opt-in client/server rendering boundaries.
  Built on `signal()` + `afterNextRender` — `afterNextRender` is a no-op on
  the server, so SSR emits the SSR-side branch (fallback for `<client-only>`,
  projected children for `<server-only>`). After the first browser render the
  signal flips and the `@if` branch swaps. `fallback` is a `TemplateRef`
  input rendered through `<ng-container [ngTemplateOutlet]>`.

  Imported from the new `/ssr` subpath (`@real-router/angular/ssr`, ng-packagr
  secondary entry-point) — see the Stage 2 `defer()` changeset for the
  cross-adapter `/ssr` migration.

  ```ts
  import { ClientOnly, ServerOnly } from "@real-router/angular/ssr";
  ```

  ```html
  <ng-template #loadingTpl>
    <span>Loading…</span>
  </ng-template>

  <client-only [fallback]="loadingTpl">
    <browser-api-widget />
  </client-only>

  <server-only>
    <seo-help-strip />
  </server-only>
  ```

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `<http-status-code [code]="N"/>` + `provideHttpStatusSink()` + `createHttpStatusSink()` to `/ssr` ([#611](https://github.com/greydragon888/real-router/issues/611))

  Render-time HTTP status declaration for SSR. Angular 21 idioms — DI token `HTTP_STATUS_SINK` provided via `provideHttpStatusSink(sink)` env-providers helper, optional `inject(HTTP_STATUS_SINK, { optional: true })` in the component. The sink write happens in `ngOnInit` (after the input binding is bound), template renders nothing.

  ```ts
  // entry-server.ts
  import { bootstrapApplication } from "@angular/platform-browser";
  import {
    createHttpStatusSink,
    provideHttpStatusSink,
  } from "@real-router/angular/ssr";

  const sink = createHttpStatusSink();
  await bootstrapApplication(AppRoot, {
    providers: [
      provideRealRouterFactory({ ... }),
      provideHttpStatusSink(sink),
    ],
  });
  response.status(sink.code ?? 200).send(html);
  ```

  ```html
  <!-- inside not-found.component.ts template -->
  <http-status-code [code]="404" />
  ```

  `code` is declared as optional `input<number>()` rather than `input.required<number>()` to keep the JIT/TestBed test path safe (`NG0950` would fire otherwise) — the `ngOnInit` body skips the write when the value is `undefined`.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - `defer()` consumers + `/ssr` subpath split ([#611](https://github.com/greydragon888/real-router/issues/611))

  Mirrors the React Stage 1 + Stage 0a roll-out ([#609](https://github.com/greydragon888/real-router/issues/609) / [#610](https://github.com/greydragon888/real-router/issues/610)). Angular ships
  via ng-packagr secondary entry-point at `packages/angular/ssr/`:
  - `injectDeferred(key)` — returns `Signal<T | undefined>` reading the
    promise published by the loader at `state.context.ssrDataDeferred[key]`.

  No `<Await>` / `<Streamed>` — Angular uses different control flow
  (`@if` / `async` pipe + signals).

  Idiom: Signals + `effect()` + `@if` / `async` pipe.

  **`<ClientOnly>` / `<ServerOnly>` migrated to `/ssr`**:

  ```diff
  - import { ClientOnly, ServerOnly } from "@real-router/angular";
  + import { ClientOnly, ServerOnly } from "@real-router/angular/ssr";
  ```

  The 3-SSR-feature-export threshold (per `.claude/SSR_FEATURE_GAPS_RU.md`
  §8) is reached with `injectDeferred` + `ClientOnly` + `ServerOnly` —
  triggers the subpath split for Angular.

  **Wire-format**: consumes the NDJSON-shaped `<script>__rrDefer__("key",
json)</script>` settle scripts emitted by `@real-router/ssr-data-plugin/server`'s
  `injectDeferredScripts` — server-side loaders return `defer({ critical,
deferred })` once.

  **Streaming behaviour**: no server-streaming, incremental hydration on
  the client — 🟡 DX-only — `injectDeferred` ready for future framework
  streaming.

  **Breaking change** (pre-1.0, allowed in `minor`): `ClientOnly`/`ServerOnly`
  removed from main entry; `injectDeferred` lives at `/ssr` only.

### Patch Changes

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `<a [realLink]="signal()">` active state not reacting to signal input changes in AOT ([#630](https://github.com/greydragon888/real-router/issues/630))

  `RealLink`, `RealLinkActive`, and `RouteView` previously captured signal-input values once in `ngOnInit` — `createActiveRouteSource` / `createRouteNodeSource` was bound to the initial `routeName` / `routeParams` / `hash` / `routeNode` values and never recreated when those inputs changed reactively. In AOT (where signal-input template bindings work), `href` updated correctly (it's a `computed`), but `.active` class kept tracking the original values — asymmetric reactivity, real bug.

  **Fix**: source-creation setup moved from `ngOnInit` into `effect((onCleanup) => …)` from the constructor. Reading signal inputs inside the effect makes the setup reactive to Angular's signal graph — any input change re-runs the effect, `onCleanup` tears down the previous source (no-op for cached sources from `@real-router/sources`), and a new source is created with the current input values. Effect cleanup auto-registers with the injection-context `DestroyRef`.

  **Behavioral parity with React/Preact**: `<Link>` in those adapters re-renders on every prop change and re-evaluates `useIsActiveRoute(routeName, params)` each time. Angular now matches that behavior in AOT.

  **JIT note**: full reactive-input verification requires AOT compilation — JIT rejects signal-input template bindings with `NG0303`. The fix is structurally correct in JIT (existing JIT tests continue to pass) but the asymmetric-reactivity scenario itself can only be reproduced under AOT. CLAUDE.md gotcha updated with the new pattern and testing limitation.

  **No public API change** — the `OnInit` interface and `ngOnInit` method were internal implementation details. Consumers' templates continue to work unchanged.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Guard against throwing `getAnnouncementText` in `createRouteAnnouncer` ([#628](https://github.com/greydragon888/real-router/issues/628))

  A user-provided `getAnnouncementText` callback that throws was propagating
  the exception up through `router.subscribe`'s listener loop, tearing down
  sibling listeners and breaking navigation tracking elsewhere. The shared
  `resolveText` helper now wraps the callback in try/catch, logs the error
  via `console.error` with a `[real-router]` prefix, and falls through to
  the built-in resolution chain (`<h1>` textContent → `document.title` →
  route name → pathname).

  User-visible effect: a buggy custom announcer resolver no longer breaks
  router subscriptions — the announcer announces the fallback text and
  logs the underlying error so the bug surfaces in dev tools.

  Discovered during the React audit (`review-2026-05-10` §5.7, MED
  severity). Applied to `shared/dom-utils/route-announcer.ts` and the
  git-tracked Angular copy.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `shallowEqual` asymmetry on disjoint-key records ([#627](https://github.com/greydragon888/real-router/issues/627))

  `shallowEqual({ a: undefined }, { b: "" })` returned `true` while
  `shallowEqual({ b: "" }, { a: undefined })` returned `false`. The inner loop
  read missing keys via bracket access as `undefined` and falsely matched
  `prev[key] === undefined`. Added a `hasOwnProperty` guard mirroring React's
  own `shallowEqual` (`packages/shared/shallowEqual.js`).

  Angular consumes a git-tracked copy of `dom-utils` (ng-packagr does not
  follow symlinks); the fix was applied to both `shared/dom-utils/link-utils.ts`
  and `packages/angular/src/dom-utils/link-utils.ts` and verified identical.

  User-visible effect: `<a realLink [routeParams]="{ a: undefined }">` no
  longer compares equal to `[routeParams]="{ b: undefined }"` in directive
  memoization paths — re-render now matches the documented `shallowEqual`
  contract (key-order-insensitive, `Object.is` per key).

- Updated dependencies [[`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c)]:
  - @real-router/core@0.53.0
  - @real-router/sources@0.8.2

## 0.8.1

### Patch Changes

- Updated dependencies [[`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783)]:
  - @real-router/core@0.52.0
  - @real-router/sources@0.8.1

## 0.8.0

### Minor Changes

- [#569](https://github.com/greydragon888/real-router/pull/569) [`5b1eae9`](https://github.com/greydragon888/real-router/commit/5b1eae9e115f5cdf45f4365f3d0bcf5625297140) Thanks [@greydragon888](https://github.com/greydragon888)! - Scroll restoration: rename `mode: "manual"` → `"native"`, add `behavior` and `storageKey` options ([#534](https://github.com/greydragon888/real-router/issues/534))

  `provideRealRouter(router, { scrollRestoration })` now accepts `behavior?: ScrollBehavior` and `storageKey?: string`. The git-tracked `packages/angular/src/dom-utils/scroll-restore.ts` copy is synced with `shared/dom-utils/`. Mode `"manual"` renamed to `"native"` (semantic clarity — utility hands off to browser-native restore, opposite of DOM `history.scrollRestoration === "manual"`).

## 0.7.0

### Minor Changes

- [#567](https://github.com/greydragon888/real-router/pull/567) [`e8f4a5c`](https://github.com/greydragon888/real-router/commit/e8f4a5c578f1094059d500b0f44ddd7ce788c534) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `hash` support to `[realLink]` and `injectIsActiveRoute` ([#532](https://github.com/greydragon888/real-router/issues/532))
  - The `realLink` directive exposes a signal `hash` input
    (`input<string | undefined>(undefined)`) that builds a URL with the
    fragment via the URL plugin's `router.buildUrl(name, params, { hash })`
    extension and, on click, calls the `navigateWithHash` helper. The helper
    auto-bypasses SAME_STATES (`force: true, hashChange: true`) when the same
    route is navigated to with a different fragment, so anchor-style same-path
    links update both URL and `state.context.url.hashChanged`.
  - `injectIsActiveRoute(name, params, { strict?, ignoreQueryParams?, hash? })`
    accepts an optional `hash` field. When provided, the returned
    `Signal<boolean>` is `true` iff the route matches AND
    `state.context.url.hash` equals the requested fragment exactly — distinct
    hashes get distinct cache entries in `@real-router/sources` (see its
    changeset).

  ```html
  <a realLink routeName="docs" hash="section">Docs</a>
  ```

### Patch Changes

- [#567](https://github.com/greydragon888/real-router/pull/567) [`e8f4a5c`](https://github.com/greydragon888/real-router/commit/e8f4a5c578f1094059d500b0f44ddd7ce788c534) Thanks [@greydragon888](https://github.com/greydragon888)! - SSR-safe anchor lookup in `createScrollRestoration` ([#532](https://github.com/greydragon888/real-router/issues/532))

  `createScrollRestoration` now reads the anchor target from
  `state.context.url.hash` (decoded, populated by the URL plugins) when
  available, falling back to `globalThis.location.hash` otherwise. Removes a
  race between the adapter's commit and the browser's hash update.

- Updated dependencies [[`e8f4a5c`](https://github.com/greydragon888/real-router/commit/e8f4a5c578f1094059d500b0f44ddd7ce788c534)]:
  - @real-router/sources@0.8.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a), [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a)]:
  - @real-router/core@0.51.0
  - @real-router/sources@0.7.3
  - @real-router/route-utils@0.2.2

## 0.6.0

### Minor Changes

- [#555](https://github.com/greydragon888/real-router/pull/555) [`6965977`](https://github.com/greydragon888/real-router/commit/69659772cd4f3c49d570ea1d7a2abec07da7dbed) Thanks [@greydragon888](https://github.com/greydragon888)! - Narrow `injectRoute()` signal return so `routeState().route` is non-nullable; throw a clear error when the router has no active state ([#535](https://github.com/greydragon888/real-router/issues/535))

  `injectRoute()` now throws `"injectRoute called with no active route. Did you forget to await router.start() before rendering, or is the router stopped/disposed?"` when called before `router.start()` resolves. The `routeState` signal narrows to `Signal<{ route: State<P>; previousRoute?: State }>` — templates use `routeState().route.name` directly. `injectRouteNode(name)` is unchanged.

## 0.5.0

### Minor Changes

- [#552](https://github.com/greydragon888/real-router/pull/552) [`1e9868e`](https://github.com/greydragon888/real-router/commit/1e9868ef02ed8f34f809fbd8bccd2a855d9a1fe2) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `injectRouteExit` and `injectRouteEnter` ([#547](https://github.com/greydragon888/real-router/issues/547))

  Angular parity with the React adapter ([#544](https://github.com/greydragon888/real-router/issues/544), [#548](https://github.com/greydragon888/real-router/issues/548)). Identical context types and option shapes; idiomatic Angular implementation uses `inject(DestroyRef)` (for the leave subscription) and `effect()` (for the enter watcher). Both must be called within an injection context.
  - **`injectRouteExit(handler, options?)`** — wraps `router.subscribeLeave` with reentrant abort pre-check and same-route skip (default `true`). Cleanup is bound to the injection context's `DestroyRef`.
  - **`injectRouteEnter(handler, options?)`** — fires `handler` once when the component is created as a result of a navigation. Skip-initial via `route.transition.from`, skip-same-route default. Reads from `injectRoute()` (`{ routeState, navigator }`) inside `effect()`; cleanup wired through the active context's `DestroyRef`.

  ```ts
  @Component({ ... })
  class FormComponent {
    constructor() {
      injectRouteExit(async ({ signal }) => {
        await this.api.saveDraft(this.form, { signal });
      });

      injectRouteEnter(({ route, previousRoute }) => {
        analytics.track("page_enter", { route: route.name, from: previousRoute.name });
      });
    }
  }
  ```

  **Handler-reactivity caveat:** `inject*` functions run **once** during component construction; the handler is captured at injection time. The common Angular pattern is to pass a class method whose identity is stable across change detection. To vary behavior over time, read signals **inside** the handler body. See `packages/angular/CLAUDE.md` for details.

  Types exported: `RouteExitContext`, `RouteExitHandler`, `UseRouteExitOptions`, `RouteEnterContext`, `RouteEnterHandler`, `UseRouteEnterOptions`.

- [#552](https://github.com/greydragon888/real-router/pull/552) [`1e9868e`](https://github.com/greydragon888/real-router/commit/1e9868ef02ed8f34f809fbd8bccd2a855d9a1fe2) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `viewTransitions` option to `provideRealRouter()` for View Transitions API integration ([#498](https://github.com/greydragon888/real-router/issues/498))

  Opt in with `provideRealRouter(router, { viewTransitions: true })` to animate route transitions via the browser's View Transitions API. The option is a boolean — utility is either enabled or no-op (SSR, Firefox without VT support).

  ```ts
  import { provideRealRouter } from "@real-router/angular";

  bootstrapApplication(AppComponent, {
    providers: [provideRealRouter(router, { viewTransitions: true })],
  });
  ```

  Customization is pure CSS via `::view-transition-*` pseudo-elements and `view-transition-name`. See the [View Transitions wiki page](https://github.com/greydragon888/real-router/wiki/View-Transitions) for patterns (hero morph, per-area transitions, direction-aware animations).

  Teardown is wired through `DestroyRef` — same architectural pattern as the existing `scrollRestoration` option ([#497](https://github.com/greydragon888/real-router/issues/497)).

### Patch Changes

- Updated dependencies [[`1e9868e`](https://github.com/greydragon888/real-router/commit/1e9868ef02ed8f34f809fbd8bccd2a855d9a1fe2)]:
  - @real-router/core@0.50.2

## 0.4.0

### Minor Changes

- [#539](https://github.com/greydragon888/real-router/pull/539) [`2f39d54`](https://github.com/greydragon888/real-router/commit/2f39d54f82dfb62da5309d8520d4c7d8281c52d6) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `RouteSelf` directive (`<ng-template routeSelf>`) for the parent-as-list pattern ([#538](https://github.com/greydragon888/real-router/issues/538))

  `RouteSelf` is a structural directive (mirrors `RouteMatch`/`RouteNotFound`)
  that marks an `ng-template` as the "self" slot for `<route-view>`. The
  template is rendered when the active route name equals the parent
  `<route-view>`'s `routeNode` input and no descendant `RouteMatch` is active.

  ```html
  <route-view [routeNode]="'users'">
    <ng-template routeSelf>
      <users-list />
    </ng-template>
    <ng-template routeMatch="profile">
      <user-profile />
    </ng-template>
  </route-view>
  ```

  Priority: `RouteMatch` (descendant) → `RouteSelf` (active equals `routeNode`)
  → `RouteNotFound` (`UNKNOWN_ROUTE`). Multiple `RouteSelf` instances follow
  first-wins (declaration order from `contentChildren`). Exported as `RouteSelf`
  from `@real-router/angular`.

## 0.3.0

### Minor Changes

- [#502](https://github.com/greydragon888/real-router/pull/502) [`dcfd9cc`](https://github.com/greydragon888/real-router/commit/dcfd9cc2578c22449d2653d25d0b09a0fdb74681) Thanks [@greydragon888](https://github.com/greydragon888)! - Add opt-in scroll restoration via `provideRealRouter(router, { scrollRestoration })` ([#497](https://github.com/greydragon888/real-router/issues/497))

  `provideRealRouter` now accepts an optional options bag. When `scrollRestoration` is provided, the adapter creates a `createScrollRestoration` instance via `provideEnvironmentInitializer`; teardown is wired through `DestroyRef`.

  ```ts
  import { provideRealRouter } from "@real-router/angular";

  bootstrapApplication(AppComponent, {
    providers: [
      provideRealRouter(router, { scrollRestoration: { mode: "restore" } }),
    ],
  });
  ```

  Supports `manual` / `top` / `restore` modes and a custom scroll container. Direction is read from `@real-router/navigation-plugin`'s `state.context.navigation`; position is persisted across reloads via `sessionStorage` + `pagehide`.

## 0.2.2

### Patch Changes

- Updated dependencies [[`8e4551f`](https://github.com/greydragon888/real-router/commit/8e4551f36af69732c0889f92a08e593a723b76c6)]:
  - @real-router/core@0.50.0
  - @real-router/sources@0.7.2

## 0.2.1

### Patch Changes

- Updated dependencies [[`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23), [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23)]:
  - @real-router/core@0.49.0
  - @real-router/sources@0.7.1

## 0.2.0

### Minor Changes

- [#479](https://github.com/greydragon888/real-router/pull/479) [`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39) Thanks [@greydragon888](https://github.com/greydragon888)! - Add generic type parameter to `injectRoute<P>()` / `RouteSignals<P>` ([#464](https://github.com/greydragon888/real-router/issues/464))

  `injectRoute<P>()` now accepts an optional generic so `routeState().route?.params` is typed without `as` casts. `RouteSignals<P>` is likewise generic, defaulting to `Params`. Runtime is unchanged — the cast happens once inside the function.

  ```typescript
  type SearchParams = { q: string; sort: string } & Params;

  const route = injectRoute<SearchParams>();
  const q = route.routeState().route?.params.q; // typed as string
  ```

### Patch Changes

- Updated dependencies [[`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39)]:
  - @real-router/sources@0.7.0

## 0.1.1

### Patch Changes

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - refactor: RouterErrorBoundary uses shared `createDismissableError` from `@real-router/sources` — removes local `dismissedVersion` state duplication ([#467](https://github.com/greydragon888/real-router/issues/467))

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: memory leak in `injectRouterTransition` / `RouterErrorBoundary` via shared cached source ([#467](https://github.com/greydragon888/real-router/issues/467))

  Migrated `injectRouterTransition` and `RouterErrorBoundary` to `getTransitionSource` / `getErrorSource` from `@real-router/sources`. The cached shared wrapper ignores external `destroy()` — safe alongside `sourceToSignal.destroy()` that runs in `DestroyRef.onDestroy`.

- Updated dependencies [[`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3)]:
  - @real-router/sources@0.6.0

## 0.1.0

### Minor Changes

- [#468](https://github.com/greydragon888/real-router/pull/468) [`5dddc5c`](https://github.com/greydragon888/real-router/commit/5dddc5c364efa265124c217c60a04b860f8d716b) Thanks [@greydragon888](https://github.com/greydragon888)! - Initial Angular 21 adapter for Real-Router ([#462](https://github.com/greydragon888/real-router/issues/462))

  New package `@real-router/angular` — signal-based, zoneless-compatible bindings for Angular 21+. Built with ng-packagr (partial Ivy compilation, FESM2022 ESM-only output).

  **Public API:**
  - `provideRealRouter(router)` — environment providers for DI
  - Injection tokens: `ROUTER`, `NAVIGATOR`, `ROUTE`
  - `inject*` functions: `injectRouter`, `injectNavigator`, `injectRoute`, `injectRouteNode`, `injectRouteUtils`, `injectRouterTransition`, `injectIsActiveRoute`
  - Components: `RouteView`, `RouterErrorBoundary`, `NavigationAnnouncer`
  - Directives: `RouteMatch`, `RouteNotFound`, `RealLink`, `RealLinkActive`
  - `sourceToSignal(source)` — bridge for RouterSource to Angular Signal

  **Features:**
  - Signal-first reactive state via `sourceToSignal` (no RxJS dependency)
  - Declarative route matching with `<route-view>` + `ng-template routeMatch="..."` / `ng-template routeNotFound`
  - WCAG-compliant navigation announcements via `NavigationAnnouncer` component
  - Link shipped with `shallowEqual`-based props equality from day 1 (same hot-path optimization as the other adapters)
  - Shared `dom-utils` (link utilities, route announcer) materialized from `shared/dom-utils/` via `prebundle` script — ng-packagr does not follow symlinks the same way tsdown does

  **Coverage threshold 94/84/94/94 (statements/branches/functions/lines)** — JIT TestBed does not bind signal `input()` in templates, so directive callbacks and `contentChildren` paths are unreachable without AOT. See `packages/angular/CLAUDE.md` for the full list of lines excluded from JIT coverage.

  **Peer dependencies:** `@angular/core >= 21.0.0`, `@angular/common >= 21.0.0`.
