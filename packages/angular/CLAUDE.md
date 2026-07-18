# @real-router/angular

> Angular 22 bindings with signal-based reactive state

## Two Entry Points

```typescript
// Client API (main entry)
import {
  provideRealRouter,
  injectRoute,
  RouteView,
  RealLink,
} from "@real-router/angular";

// SSR-feature surface (subpath)
import {
  ClientOnly,
  HttpStatusCode,
  createHttpStatusSink,
} from "@real-router/angular/ssr";
```

**Peer dependency:** `@angular/core` >= 22.0.0, `@angular/common` >= 22.0.0

**Architecture:** Flat structure with two entry points (main + `/ssr` ng-packagr secondary entry). All code lives in `src/` and `ssr/`. Built with ng-packagr (partial compilation mode). Signal-first, zoneless-compatible.

### Source Structure

```
src/                            # Main entry — client API
├── functions/                  # 9 public inject* functions + 1 internal helper
│   ├── injectRouter.ts
│   ├── injectNavigator.ts
│   ├── injectRoute.ts
│   ├── injectRouteNode.ts
│   ├── injectRouteUtils.ts
│   ├── injectRouterTransition.ts
│   ├── injectIsActiveRoute.ts
│   ├── injectRouteExit.ts        # Wraps subscribeLeave with abort + same-route guards
│   ├── injectRouteEnter.ts       # Fires on nav-driven mount via effect() + transition.from
│   ├── injectOrThrow.ts          # Internal helper — non-null inject() wrapper
│   └── index.ts
├── directives/                 # 5 directives
│   ├── RouteMatch.ts           # ng-template marker for route segments
│   ├── RouteSelf.ts            # ng-template marker for exact-match on the node itself
│   ├── RouteNotFound.ts        # ng-template marker for not-found
│   ├── RealLink.ts             # <a realLink> navigation directive
│   ├── RealLinkActive.ts       # [realLinkActive] active class directive
│   └── index.ts
├── components/                 # Components
│   ├── RouteView.ts            # Declarative route matching (Match → Self → NotFound priority)
│   ├── RouterErrorBoundary.ts  # Error handling component
│   ├── NavigationAnnouncer.ts  # Accessibility announcer
│   └── index.ts
├── dom-utils/                  # Shared DOM utilities (git-tracked copy of shared/dom-utils/)
│   ├── link-utils.ts           # buildHref, buildActiveClassName, applyLinkA11y, navigateWithHash, shallowEqual, shouldNavigate
│   ├── route-announcer.ts      # createRouteAnnouncer
│   ├── scroll-restore.ts       # createScrollRestoration
│   ├── scroll-spy.ts           # createScrollSpy — IntersectionObserver → URL hash (#575)
│   ├── view-transitions.ts     # createViewTransitions
│   ├── direction-tracker.ts    # createDirectionTracker — optional utility, not re-exported from src/index.ts (consumers import from "@real-router/angular/dom-utils" deep-path)
│   └── index.ts
├── internal/                   # Internal helpers (not re-exported)
│   ├── install.ts              # installScrollRestoration + installScrollSpy + installViewTransitions — shared by providers + providersFactory
│   ├── subscribeSourceToSignal.ts  # subscribe → setState → cleanup pattern (RealLink, RealLinkActive, RouteView)
│   └── createStableParams.ts   # shallowEqual content-stabilization for routeParams (RealLink, RealLinkActive) — #988
├── providers.ts                # ROUTER, NAVIGATOR, ROUTE tokens + provideRealRouter
├── providersFactory.ts         # provideRealRouterFactory (SSR/SSG per-request clones)
├── sourceToSignal.ts           # RouterSource → Signal bridge
├── types.ts                    # RouteSignals, ErrorContext interfaces
└── index.ts                    # Main entry — public exports

ssr/                            # /ssr subpath — SSR-feature surface
├── public_api.ts               # Public exports (8 names + 1 type)
├── ng-package.json             # ng-packagr secondary entry config
├── components/
│   ├── ClientOnly.ts           # <client-only [fallback]>
│   ├── ServerOnly.ts           # <server-only>
│   └── HttpStatusCode.ts       # <http-status-code [code]="N">
├── functions/
│   ├── injectDeferred.ts       # Reads state.context.ssrDataDeferred[key]
│   └── provideHttpStatusSink.ts  # Wires HTTP_STATUS_SINK provider
└── utils/
    └── createHttpStatusSink.ts # HTTP_STATUS_SINK + createHttpStatusSink
```

## Exports

| Export                                                           | Type           | Description                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provideRealRouter(router, options?)`                            | Provider       | Environment providers for DI. `options.scrollRestoration` enables scroll capture + restoration via `createScrollRestoration`; `options.scrollSpy` enables router-coordinated `IntersectionObserver` URL hash spy via `createScrollSpy` (#575); `options.viewTransitions: true` enables View Transitions API integration via `createViewTransitions`; teardown of all three utilities wired through `DestroyRef`. |
| `RealRouterOptions`                                              | Type           | `{ scrollRestoration?: ScrollRestorationOptions; scrollSpy?: ScrollSpyOptions; viewTransitions?: boolean }` — second arg to `provideRealRouter`                                                                                                                                                                                                                                                                  |
| `provideRealRouterFactory(options)`                              | Provider       | SSR/SSG environment providers. `useFactory` for per-request router clones via Angular's `REQUEST` token, `provideAppInitializer` async start, `DestroyRef.onDestroy` per-request `router.dispose()`. See "SSR Support" section.                                                                                                                                                                                  |
| `RealRouterFactoryOptions<TDeps>`                                | Type           | `{ baseRouter, plugins?, deps?, scrollRestoration?, scrollSpy?, viewTransitions? }` — second arg to `provideRealRouterFactory`                                                                                                                                                                                                                                                                                   |
| `RequestDepsFactory<TDeps>`                                      | Type           | `(request: Request \| null) => TDeps \| undefined` — derive per-request deps from REQUEST                                                                                                                                                                                                                                                                                                                        |
| `RequestPluginsFactory<TDeps>`                                   | Type           | `(request: Request \| null) => readonly PluginFactory<TDeps>[]` — conditional plugin list                                                                                                                                                                                                                                                                                                                        |
| `ROUTER`                                                         | InjectionToken | Router instance token                                                                                                                                                                                                                                                                                                                                                                                            |
| `NAVIGATOR`                                                      | InjectionToken | Navigator instance token                                                                                                                                                                                                                                                                                                                                                                                         |
| `ROUTE`                                                          | InjectionToken | Route signals token                                                                                                                                                                                                                                                                                                                                                                                              |
| `injectRouter()`                                                 | Function       | Get router instance                                                                                                                                                                                                                                                                                                                                                                                              |
| `injectNavigator()`                                              | Function       | Get navigator instance                                                                                                                                                                                                                                                                                                                                                                                           |
| `injectRoute()`                                                  | Function       | Subscribe to all route changes                                                                                                                                                                                                                                                                                                                                                                                   |
| `injectRouteNode(name)`                                          | Function       | Subscribe to specific node changes                                                                                                                                                                                                                                                                                                                                                                               |
| `injectRouteUtils()`                                             | Function       | Get route tree utilities                                                                                                                                                                                                                                                                                                                                                                                         |
| `injectRouterTransition()`                                       | Function       | Subscribe to transition state                                                                                                                                                                                                                                                                                                                                                                                    |
| `injectIsActiveRoute(name, params?, opts?)`                      | Function       | Subscribe to active route state                                                                                                                                                                                                                                                                                                                                                                                  |
| `injectRouteExit(handler, options?)`                             | Function       | Subscribe to leave window (handler captured at injection time)                                                                                                                                                                                                                                                                                                                                                   |
| `injectRouteEnter(handler, options?)`                            | Function       | Fire on nav-driven mount (handler captured at injection time)                                                                                                                                                                                                                                                                                                                                                    |
| `RouteView`                                                      | Component      | Declarative route matching                                                                                                                                                                                                                                                                                                                                                                                       |
| `RouterErrorBoundary`                                            | Component      | Navigation error handling                                                                                                                                                                                                                                                                                                                                                                                        |
| `NavigationAnnouncer`                                            | Component      | WCAG announcer. Optional `[prefix]` / `[getAnnouncementText]` signal inputs customize the announcement text (parity with `announceNavigation` options on the other adapters); read once in `ngOnInit`. Falls back to the default `h1 → title → route-name` chain on empty/throw.                                                                                                                                 |
| `RouteMatch`                                                     | Directive      | Route segment marker (`<ng-template routeMatch="segment">`)                                                                                                                                                                                                                                                                                                                                                      |
| `RouteSelf`                                                      | Directive      | Exact-match slot for the parent `<route-view>`'s node (`<ng-template routeSelf>`). Renders only when the active route name equals the `routeNode` input — useful for "index" content on a node that also has children                                                                                                                                                                                            |
| `RouteNotFound`                                                  | Directive      | Not-found marker — renders when `state.name === UNKNOWN_ROUTE`                                                                                                                                                                                                                                                                                                                                                   |
| `RealLink`                                                       | Directive      | Navigation link directive for `<a>` elements (hash-aware via `[hash]`)                                                                                                                                                                                                                                                                                                                                           |
| `RealLinkActive`                                                 | Directive      | Active route class directive for any element. **Note**: does NOT accept a `hash` input — hash-aware active state is `RealLink`-only                                                                                                                                                                                                                                                                              |
| `sourceToSignal`                                                 | Function       | RouterSource to Signal bridge                                                                                                                                                                                                                                                                                                                                                                                    |
| `RouteSignals<P>`                                                | Type           | `{ routeState: Signal<RouteSnapshot<P>>; navigator }` — return shape of `injectRouteNode` (nullable `route`)                                                                                                                                                                                                                                                                                                     |
| `ErrorContext`                                                   | Type           | `{ $implicit: RouterError; resetError: () => void }` — `RouterErrorBoundary` template context                                                                                                                                                                                                                                                                                                                    |
| `RouteSnapshot<P>` re-export                                     | Type           | From `@real-router/sources` — emitted by `RouteSignals.routeState()`                                                                                                                                                                                                                                                                                                                                             |
| `RouterTransitionSnapshot` re-export                             | Type           | From `@real-router/sources` — emitted by `injectRouterTransition()`                                                                                                                                                                                                                                                                                                                                              |
| `RouterErrorSnapshot` re-export                                  | Type           | From `@real-router/sources` — error source snapshot                                                                                                                                                                                                                                                                                                                                                              |
| `Navigator` re-export                                            | Type           | From `@real-router/core` — read-only navigation surface                                                                                                                                                                                                                                                                                                                                                          |
| `RouteExitContext`, `RouteExitHandler`, `UseRouteExitOptions`    | Types          | Types associated with `injectRouteExit`                                                                                                                                                                                                                                                                                                                                                                          |
| `RouteEnterContext`, `RouteEnterHandler`, `UseRouteEnterOptions` | Types          | Types associated with `injectRouteEnter`                                                                                                                                                                                                                                                                                                                                                                         |

## Functions

| Function                                    | Returns                                                                                                                                                   | Reactive?                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `injectRouter()`                            | `Router`                                                                                                                                                  | Never                                |
| `injectNavigator()`                         | `Navigator`                                                                                                                                               | Never                                |
| `injectRoute()`                             | `RouteSignals`                                                                                                                                            | routeState on every navigation       |
| `injectRouteNode(name)`                     | `RouteSignals`                                                                                                                                            | Only when node activates/deactivates |
| `injectRouteUtils()`                        | `RouteUtils`                                                                                                                                              | Never                                |
| `injectRouterTransition()`                  | `Signal<RouterTransitionSnapshot>`                                                                                                                        | On transition start/end              |
| `injectIsActiveRoute(name, params?, opts?)` | `Signal<boolean>`                                                                                                                                         | On active state change               |
| `injectRouteExit(handler, options?)`        | `void` — wraps `router.subscribeLeave` with abort + same-route guards (handler captured at injection time, cleanup via `DestroyRef`)                      | Never                                |
| `injectRouteEnter(handler, options?)`       | `void` — fires once on nav-driven mount via `injectRoute()` + `effect()` (handler captured at injection time, cleanup via injection-context `DestroyRef`) | Never                                |

## SSR-feature surface — `@real-router/angular/ssr`

All SSR-aware components and SSR functions live at the `/ssr` subpath
(ng-packagr secondary entry-point). Seven exports:

| Export                           | Kind           | Purpose                                                                                                                                                                                                                    |
| -------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<client-only>`                  | component      | Server emits `[fallback]` TemplateRef; client swaps to projected children after `afterNextRender`. For browser-API consumers (`window`/`document`), ad slots, dynamic widgets.                                             |
| `<server-only>`                  | component      | Symmetric inverse: server emits projected children; client swaps to `[fallback]` after the first browser render. For SEO-only meta strips, zero-JS sections inside an otherwise-hydrated page.                             |
| `<http-status-code [code]="N"/>` | component      | Render-time HTTP status declaration. Writes `code` to the optionally injected `HTTP_STATUS_SINK` in `ngOnInit` (after the input binding fires) and renders nothing. Last write wins. No-op when no provider is registered. |
| `injectDeferred<T>(key)`         | function       | Reads `state.context.ssrDataDeferred[key]` (published by `defer()` in `@real-router/ssr-data-plugin`). Returns `Signal<T \| undefined>` that updates when the promise settles.                                             |
| `provideHttpStatusSink(sink)`    | function       | Environment providers helper that wires `HTTP_STATUS_SINK` for the request-scoped sink. Equivalent to `{ provide: HTTP_STATUS_SINK, useValue: sink }`.                                                                     |
| `HTTP_STATUS_SINK`               | InjectionToken | DI token for the request-scoped `HttpStatusSink`. Inject with `{ optional: true }` on the client side.                                                                                                                     |
| `createHttpStatusSink()`         | utility        | Returns a fresh `HttpStatusSink` (`{ code: number \| undefined }`) — construct one per request, read `sink.code` after the SSR render pass to apply to the response.                                                       |

```html
<ng-template #loadingTpl>
  <span>Loading…</span>
</ng-template>

<client-only [fallback]="loadingTpl">
  <browser-api-widget />
</client-only>

<server-only>
  <seo-meta-strip />
</server-only>

<!-- Render-time HTTP status decision -->
<http-status-code [code]="404" />
```

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

```ts
import { injectDeferred } from "@real-router/angular/ssr";

@Component({
  template: `
    @if (reviews()) {
      <ul>
        @for (r of reviews(); track r.id) {
          <li>{{ r.author }}</li>
        }
      </ul>
    } @else {
      <p>Loading reviews…</p>
    }
  `,
})
export class Reviews {
  readonly reviews = injectDeferred<Review[]>("reviews");
}
```

**Implementation notes:**

- `<client-only>`/`<server-only>`: `signal(false)` + `afterNextRender(() => mounted.set(true))`. `afterNextRender` is a no-op on the server (Angular runtime guarantees), so SSR emits the SSR-side branch — projected children for `<server-only>`, the bound `[fallback]` `TemplateRef` for `<client-only>`. After the first browser render the signal flips and the `@if` branch swaps.
- `<http-status-code>`: writes to `inject(HTTP_STATUS_SINK, { optional: true })` in `ngOnInit` (after the input binding has fired). `code` is declared as optional `input<number>()` rather than `input.required<number>()` to keep the JIT/TestBed test path safe (`NG0950` would fire under JIT signal-input limitations) — the body skips the write when the value is `undefined`. Loader-driven errors (`LoaderNotFound` → 404, `LoaderRedirect` → 30x) keep working as before; this component covers render-time decisions only.
- **Asymmetric Angular**: no `<Await>` / `<Streamed>` adapter components. Angular has no native `<Suspense>` / `use(promise)` analogue, so `injectDeferred()` returns a `Signal<T | undefined>` (starts undefined, updates on settle) instead. Compose with `@if (signal()) { … } @else { … }`, the `async` pipe (`from(deferredPromise)`), or native `@defer` blocks for chunk-level lazy hydration.
- Trigger reached at #610 (defer + injectDeferred + ClientOnly + ServerOnly = 3 SSR-feature exports, ≥3 was the threshold from `.claude/SSR_FEATURE_GAPS_RU.md` §8). Built as a ng-packagr secondary entry-point at `packages/angular/ssr/` with its own `ng-package.json` — produces `dist/fesm2022/real-router-angular-ssr.mjs` + `dist/types/real-router-angular-ssr.d.ts`.

## Gotchas

### `injectRouteExit` / `injectRouteEnter` Handler Is Captured At Injection Time

Angular `inject*` functions run **once** during component construction — the
`handler` argument is captured in closure at the call site and is **not
reactive**. Replacing the handler reference between renders has no effect
(there are no renders in the React/Vue sense). The common Angular pattern is
to pass a class method (or arrow-property) — its identity is stable across
change detection. To vary behavior over time, read signals **inside** the
handler body:

```ts
@Component({ ... })
class FormComponent {
  private draft = signal<Draft | null>(null);

  constructor() {
    injectRouteExit(async ({ signal }) => {
      const current = this.draft();
      if (current) await this.api.save(current, { signal });
    });
  }
}
```

Same applies to `injectRouteEnter`. This contrasts with React/Preact, where
`useRouteExit` keeps a `handlerRef` that's updated on every render.

### Synchronous `router.navigate()` inside an `injectRouteExit` handler throws `REENTRANT_NAVIGATION`

An `injectRouteExit` exit handler runs as a transition-event listener — it is
forwarded into `router.subscribeLeave` with no isolation. Core bans a
**synchronous** `router.navigate()` (and `navigateToDefault` / `navigateToState`
/ `navigateToNotFound`) called from inside such a listener: it throws
`RouterError(REENTRANT_NAVIGATION)` at the facade (#1030–#1035), so a redirect
written straight into the handler body tears the exit down instead of navigating.
**Defer it** out of the listener call stack — wrap in `queueMicrotask(...)`, or
`await` anything first (any `await` / `.then` moves the call off the listener
stack, where navigation is allowed):

```ts
injectRouteExit(({ nextRoute }) => {
  if (nextRoute.name === "checkout" && !isAuthed()) {
    // WRONG — throws REENTRANT_NAVIGATION (synchronous, inside the listener):
    //   router.navigate("login");
    queueMicrotask(() => router.navigate("login")); // CORRECT — deferred
  }
});
```

The same ban applies to `injectRouteEnter` handlers.

### injectRoute throws when route is undefined

`injectRoute()` returns `{ navigator, routeState: Signal<{route: State<P>; previousRoute?: State}> }` —
`route` inside the snapshot is **non-nullable**. The function throws when
called before `await router.start()` resolves (or after the router is
stopped/disposed). `injectRouteNode(name)` keeps its nullable `route` — node
inactivity is a legitimate business state, not a lifecycle error.

```ts
// Before:
const route = injectRoute<{ id: string }>();
const id = computed(() => route.routeState().route?.params.id ?? "fallback");

// After:
const route = injectRoute<{ id: string }>();
const id = computed(() => route.routeState().route.params.id);
```

### Typed route params via generic

`injectRoute<P>()` and `RouteSignals<P>` accept an optional generic so `routeState().route.params` is typed without `as` casts. Runtime is unchanged — the cast happens once inside the function.

```typescript
type SearchParams = { q: string; sort: string } & Params;

const route = injectRoute<SearchParams>();
const q = route.routeState().route.params.q; // typed as string
```

### RouteView uses `routeNode` alias for `nodeName` input

The `nodeName` property collides with `HTMLElement.nodeName` (read-only). Angular's template binding would fail. The input is aliased as `routeNode`:

```html
<route-view [routeNode]="''">
  <ng-template routeMatch="home">...</ng-template>
</route-view>
```

### JIT mode limitations

Angular 22 JIT mode (used in TestBed without the Angular Vite plugin) does not support signal-based `input()` in template bindings, and `contentChildren()` queries never populate. This affects component/directive testing in the default **jit** vitest project. Paths that require real template compilation are covered by the **aot** vitest project (`tests/aot/**`, compiled by `@analogjs/vite-plugin-angular`) — see "Coverage Ceiling → AOT test project" below.

### sourceToSignal requires injection context

`sourceToSignal` calls `inject(DestroyRef)` internally. Must be called within a constructor, field initializer, or `runInInjectionContext`.

### sourceToSignal.destroy() is safe for shared cached sources

`sourceToSignal` calls `source.destroy()` in `DestroyRef.onDestroy`. For cached sources from `@real-router/sources` (returned by `getTransitionSource`, `createDismissableError`, cached `createRouteNodeSource`, cached `createActiveRouteSource`), `destroy()` is a **no-op** — the shared source survives all consumer teardowns and lives as long as the router. Safe to use in directives (`RealLink`, `RealLinkActive`, `RouteView`) without worrying about tearing down other consumers of the same router.

### RouterErrorBoundary uses createDismissableError

`RouterErrorBoundary` subscribes to `createDismissableError(router)` from `@real-router/sources` via `sourceToSignal`. Dismissal state and `resetError` are integrated in the snapshot — no local `dismissedVersion` signal. Shared across multiple boundaries via WeakMap cache.

### Directives use constructor + `effect()` for input-dependent reactive setup (#630)

`RealLink`, `RealLinkActive`, and `RouteView` create their subscription sources inside `effect(...)` blocks scheduled from the constructor. The effect reads signal inputs in its body, so any change to `[realLink]`, `[routeParams]`, `[hash]`, `[realLinkActive]`, or `[routeNode]` re-runs the effect → tears down the previous source via `onCleanup` → creates a new one with the current inputs.

This pattern replaces the legacy `ngOnInit`-based setup that captured input values once at mount — that pattern produced a real AOT bug (active class drifted when bindings updated, see [#630](https://github.com/greydragon888/real-router/issues/630)). The Angular 16+ signal-input model makes `ngOnInit` redundant: the effect's first run is scheduled after the input bindings have been applied, so reading inputs inside the effect is safe at first execution.

Effect cleanup is bound automatically to the host directive's injection-context `DestroyRef` — no explicit `inject(DestroyRef).onDestroy(...)` wiring is required (effects self-register).

**`routeParams` is content-stabilized before the effect reads it (#988).** Angular re-allocates an inline `[routeParams]="{ id: 1 }"` literal on every change detection, so reading the raw input signal inside the effect would re-create the cached active-route source (`canonicalJson` cache-key churn + sub/unsub) and re-run `buildHref` on every navigation even when the param content is unchanged. `RealLink` / `RealLinkActive` route their `routeParams` through the internal `createStableParams` helper (`computed` + `shallowEqual`), which re-emits a reference-stable value until the param content actually changes — so the source-creation effect and the `href` computed bail on same-content navigations. Binding a stable reference (a component field or signal) already produced zero churn; this closes the gap for inline-literal binds. Mirrors the Vue `<Link>` fix. Behavior is unchanged — the stabilized params are always content-equal to the input. Nested-object param _values_ fall back to per-render recompute (`shallowEqual` compares them by reference) — bind a stable `signal`/`computed` if it matters.

**Consequence for tests**: full reactive-input verification (e.g., changing `[routeName]="signal()"` on `<a realLink>` and asserting `.active` class re-binds) requires AOT compilation — JIT mode rejects signal-input template bindings with `NG0303`. Use `@analogjs/vite-plugin-angular` or e2e via Playwright against a production-mode example app. The content-stabilization is unit-tested via the JIT-safe toy pattern (`tests/functional/createStableParams.test.ts`) — a plain `signal<Params>()` drives the same `createStableParams` helper the directives feed their input signal into (the effect-re-run mechanism is identical for `input()` and `signal()`).

**Historical — distinct `[routeParams]` / `[realLink]` keys on a reused node once accumulated eternal sources (#766, fixed in sources 0.9.0).** Each effect rebuild creates a `createActiveRouteSource` for the new `(name | params | hash)` key. Before the lazy-connection fix these sources subscribed to the router eagerly and never disconnected (`destroy()` is a no-op; `onCleanup` only tears down the _bridge subscription_), so a node that genuinely cycled through many **distinct** keys — the textbook case a long virtual list / `@for` with **track-identity** reuse, where a single `<a realLink [routeParams]="item().params">` is re-bound to thousands of param values as the user scrolls — left one permanent router listener per unique key and walked monotonically toward the `EventEmitter` `Listener limit (10000)` crash. It was the lowest-threshold path to #766 in the adapter series: one reused directive, no thousands of `RealLink` instances (React/Preact/Vue), no remount workaround (Svelte `{#key}`).

**Fixed in sources 0.9.0 (lazy connect / disconnect).** The active-route source now connects on its first listener and disconnects when its last one unsubscribes — the bridge's `onCleanup` **is** that last unsubscribe, so re-binding across an unbounded key space no longer accumulates. The cache **entry** (a closure) still lives with the router, but it holds **no** router subscription without a live listener — "never released" was only ever true of the closure, never of the subscription (the accumulation source). Simultaneously-live consumers still cost **one** router subscription each: expected cost, not a leak, released when the last listener unsubscribes or the router is GC'd. The P3 regression test (`tests/functional/reactive-lifecycle.test.ts:103`) pins it — one directive cycling 200 distinct `[routeParams]` holds `active ≤ 1` router subscription, not 200. (Content-stabilization, #988 above, remains an orthogonal optimization that collapses inline-literal churn when the param _content_ is unchanged.)

### No RxJS

Signal-first approach. No `rxjs` or `@angular/core/rxjs-interop` dependencies.

### RealLink swallows navigation errors

`RealLink.onClick` invokes `router.navigate(...).catch(() => {})`. Failed navigations (rejected guards, missing routes) are silently dropped at the click handler. Subscribe via `RouterErrorBoundary` or `createDismissableError` / `getErrorSource` (from `@real-router/sources`) to observe them.

### RealLink mutates DOM directly, bypassing Angular CD

`RealLink.updateDom()` calls `this.anchor.setAttribute("href", href)` and `this.anchor.classList.toggle(activeClass, this.isActive())` **directly on the native element** from inside the `createActiveRouteSource` subscribe callback. This bypasses Angular's change detection — there is no template binding for `href` or `class` to invalidate.

**Why this is intentional**:

- The directive owns its host element, so direct DOM writes are scope-safe.
- The `subscribe` callback fires synchronously from `source.updateSnapshot` (see [packages/sources/CLAUDE.md → "Notification flow"](../sources/CLAUDE.md)) — at that point the router state has already updated but Angular has not scheduled a CD pass yet. Writing the attribute synchronously commits the new `href` immediately, with no intermediate "stale" frame.
- Zoneless apps benefit doubly: no microtask roundtrip through Angular's scheduler for a one-attribute write.

**Consequences**:

- `ngOnChanges` / template `[href]` bindings on the same element would conflict — do not double-bind.
- Tests that watch `host.attributes` via Angular's `ComponentRef.changeDetectorRef` will NOT see the update via `fixture.detectChanges()` alone — they must read the DOM attribute directly.
- `prevHref` / `prevActiveClass` instance fields cache the last-written values to skip redundant `setAttribute` / `classList.remove` calls (added per audit §8.2 hot-path optimization).

### RouteView commits the route swap synchronously — bypasses the deferred zoneless CD flush (#1466)

`RouteView`'s route-source subscribe callback calls `this.cdr.detectChanges()` immediately after `this.routeState.set(...)`. The route source notifies **synchronously** from `router.navigate()`, but the template `@if (activeTemplate())` / `ngTemplateOutlet` swap only renders on a change-detection pass — which zoneless Angular **schedules asynchronously**. That deferral was a ~0.85 ms idle gap between the click and the route-DOM commit (`navMsWall` ≫ `navMsTask`). Because the callback fires **outside** Angular's CD (from the click task, via `navigate()`), a local `detectChanges()` there materialises the outlet swap in the same task — collapsing felt nav latency to ≈ its CPU cost (measured **navMsWall 0.97 → 0.07 ms**, ~13× on nav-latency; nested-switch ~7×, nav-churn ~13×). `@angular/router` activates its `<router-outlet>` synchronously for the same reason, so this brings `RouteView` to parity/ahead. Philosophically identical to the sibling `RealLink` direct-DOM-write above — both commit **in-task** rather than waiting for the scheduler.

- **Initial snapshot is NOT `detectChanges()`d.** The effect's first run applies `source.getSnapshot()` while inside the initial CD, where a re-entrant `detectChanges()` would throw. Only subsequent navigation emissions (which fire from `navigate()`, outside CD) sync-commit.
- **The render now lands in-task**, so CPU-metric sweeps (`wide`/`deep`/`search-param` `navMsTask@N`) tick up a few µs — this is the same render relocating into the measured window, not new work (the deferred flush did it later); real-router stays far ahead of `@angular/router` on all of them.
- **Re-entrant `router.navigate()` during a CD pass** (e.g. from a user `effect()`) would make this `detectChanges()` re-entrant — an anti-pattern the lifecycle handlers already ban (`REENTRANT_NAVIGATION`); defer such navigations (`queueMicrotask`). In dev this may surface `ExpressionChangedAfterItHasBeenChecked`.
- **RouteView covers the outlet swap; `injectRoute` / `injectRouteNode` cover the leaf displays.** A component that reads route state via `injectRoute()` and shows it in a template (`{{ params.id }}`, active content, route name) hits the **same** deferred-CD gap — and `RouteView`'s swap doesn't reach it (same-route param change, or a view with no `RouteView` at all). So `injectRoute` / `injectRouteNode` **also** sync-commit their consuming component on route change: they subscribe to the (cached) route source and call `detectChanges()` on the consumer's `ChangeDetectorRef` (injected `{ optional: true }` — environment-context usage stays deferred). This is why param-nav (`navMsWall` 0.77 → 0.10, ~8×) and active-links (0.73 → 0.08, ~9×) collapse even though neither is a route-switch. `subscribe` fires on navigations only (not initial), so there's no in-CD setup re-entrancy. `@angular/router` structurally can't match this — its route bindings flow through `@Input` / CD.

### Internal `@@`-prefixed routes are stripped from announcements

`createRouteAnnouncer` filters out route names starting with `@@` (used internally by core for synthetic states like `UNKNOWN_ROUTE`). The announcer falls back to `document.title` or `location.pathname` when the route name is internal.

### `buildHref` falls back through `buildUrl` → `buildPath`

`router.buildUrl` is added by `@real-router/browser-plugin` and includes the search/hash. Without the plugin, `buildHref` uses `router.buildPath` (path only). Routes that don't exist in the tree return `undefined` and emit a `console.error`. **Empty `routeName=""` also triggers this error path** — `router.buildPath("")` throws, the catch returns `undefined`, and `console.error` is logged. Consumers of `<a realLink>` without a `routeName` input will see this during dev — suppress with default input or guard in host.

### `[realLink hash]` Input (#532)

`hash = input<string | undefined>(undefined)` — URL fragment (decoded, no leading `#`). Tri-state:

- `undefined` (default) — preserves the current `state.context.url.hash` on click.
- `""` — clears the hash.
- `"value"` — sets the hash; click routes through `navigateWithHash`, which auto-adds `force: true, hashChange: true` when the requested hash differs from `state.context.url.hash` on the same route+params (bypasses core's `SAME_STATES`).

```html
<a realLink [routeName]="'settings'" [hash]="'profile'">Profile</a>
<a realLink [routeName]="'settings'" [hash]="'account'">Account</a>
```

`hash` is a signal input — bind a `signal()`/`computed()` to react to changes. **Active state is hash-aware on `<a realLink [hash]="…">` only** — the directive lights up iff route matches AND `state.context.url.hash` equals the expected fragment. `[realLinkActive]` is the styling-only counterpart and does NOT accept a `hash` input: it tracks the route+params combination without fragment disambiguation. For tab-style UIs where each tab must light up its own active class, prefer `<a realLink [hash]>` (one anchor per tab) over `<li [realLinkActive]>` plus a child `<a realLink>` — the latter cannot tell tabs apart. Hash-plugin runtime always returns `false` for hash-aware active checks (consistent with the documented hash-plugin limitation).

### `encodeFragmentInline` is NOT idempotent — DECODED input contract

`buildHref` / `navigateWithHash` accept the `hash` argument as a **decoded** fragment (no leading `#`, no percent-escapes). The internal `encodeFragmentInline` helper runs `encodeURI(hash).replaceAll("#", "%23")` — feeding an already-wire-encoded string back in double-encodes the `%` (e.g. `"a%20b"` → wire `"a%2520b"`). Pinned by `tests/property/buildHref.properties.ts` Invariant 13 (audit §6.2 #1).

### `DestroyRef` one-shot cleanup semantic

`sourceToSignal` registers `source.destroy()` once on `DestroyRef.onDestroy`. Calling `signal()` after the destroy is safe — Angular's `DestroyRef` fires its callbacks exactly once, and `sourceToSignal` does not re-register on every read. The cleanup is idempotent (cached sources from `@real-router/sources` no-op on `destroy()`; non-cached sources guard internally).

### `TransferState` SSR-state bridge key — internal one-shot

`provideRealRouterFactory` reads/writes the SSR-resolved router state via Angular's `TransferState` under the internal key `@real-router/angular:ssrState`. On the client, the key is **removed immediately after consumption** (one-shot semantic — parity with `delete window.__SSR_STATE__` used by other 5 adapters). Do not expect the entry to survive past `provideAppInitializer` — subsequent reads return `null`.

### `RouterErrorBoundary.onError.subscribe(...)` is not RxJS

Despite the `subscribe` method name and `output()` source, the boundary's `onError` is an Angular `OutputEmitterRef` — NOT an `Observable`. Calling `.subscribe(callback)` returns an `OutputRefSubscription` (with `unsubscribe`), not an RxJS `Subscription`. The "No RxJS" policy (Gotcha #10 below) holds — no `rxjs` import is required to consume `onError`.

### `history.scrollRestoration` setter may throw — defensively caught

`createScrollRestoration` toggles `history.scrollRestoration = "manual"` inside a `try { ... } catch { /* ignore */ }`. Some embedded browsers (older Android WebView, certain JSDOM versions) declare the property non-writable; the setter throws `TypeError`. The catch keeps the rest of the scroll-restore wiring functional and falls back to native browser scroll restoration. Pinned by `tests/functional/scroll-restore.test.ts:794-844`.

## Coverage Ceiling (~98%) — JIT Limitation, not Poor Testing

Coverage thresholds are **98%/94%/99%/98%** (statements/branches/functions/lines), not 100%. Since #1512 layers 1-2 this is **no longer untested code**: the ordinary non-JIT gaps (providersFactory, dom-utils) are closed in the jit suite, and the aot project exercises every previously JIT-unreachable path (`RouteView` fallback resolution, `RealLink` / `RealLinkActive` active flips, href writes, class transitions) with mutation-validated assertions.

What keeps the floor below 100 is structural: **merge duplicates** (files tested in BOTH projects keep uncovered jit-emit twins of lines the aot map covers — see the gotcha below) and a few **AOT-emit phantom branches** (the angular#64583 class: branch records on lines whose every semantic path executes). Closing those would require evicting each Angular-entity file's tests wholly into the aot project and would still not guarantee 100% branches — measured and deliberately not pursued.

**Root cause:** signal-based initializer APIs (`input()`, `contentChildren()`, …) only register through a compiler transform. Under plain vitest+esbuild there is no Angular transform, so `contentChildren` queries stay empty forever and any `[routeName]="value"` binding to a signal input fails with `NG0303: Can't bind to 'routeName' since it isn't a known property`. AOT compilation is the only way these paths execute.

### AOT test project (`tests/aot/`) — #1512

The package's `vitest.config.mts` declares two `test.projects` in ONE run:

- **`jit`** — the whole pre-existing suite, esbuild-transpiled, exactly as before. Tests pinning empty-query behavior (`"JIT: notFounds empty"`) belong here and stay valid.
- **`aot`** — only `tests/aot/**`, compiled by `@analogjs/vite-plugin-angular` (full Ivy). Hosts the `RouteView` fallback/duplicate-marker fixtures (K0 canary + S1/S2/M1-M4 from RFC #1439 §5) that are structurally unreachable under JIT. Fixtures asserting populated `contentChildren` live ONLY here — added to the jit project they would fail (empty queries), correctly.

Coverage is a root-only vitest option: both projects merge into one report, which is what lets the former `/* v8 ignore */` in `RouteView.ts` stay removed — AOT-only hits count toward the thresholds.

Gotchas baked into the setup (hard-won on 2026-07-18, see RFC `.claude/rfc-1512-aot-unit-coverage-ru.md`):

- **`tsconfig.spec.aot.json` must force `module: ES2022` + `moduleResolution: bundler`.** The analog plugin emits by tsconfig `module`; the root's `NodeNext` + this package's `"type": "commonjs"` produce CJS emit → vitest 4 rejects `require("vitest")`. This was the historical "type: commonjs × vitest ESM" PoC barrier — an emit-format issue, solved entirely inside the spec tsconfig.
- **`transformFilter` keeps the AOT emit down to the fixtures + `RouteView.ts` + `src/directives/`.** Every file the Angular compiler emits gets DIFFERENT function/statement source-ranges than esbuild, and the jit+aot coverage merge then double-counts that file's entries (a package-wide filter collapsed the functions metric 98.18% → 87.19%). Widen the filter only together with fixtures that actually execute the newly AOT-compiled file.
- **`esbuild: {}` in the aot project config is load-bearing.** The plugin disables vite's built-in esbuild transform unless the user config sets one — without it, every `.ts` outside the transformFilter reaches the module runner as raw TS and rollup fails on `import type`.
- **Merge duplicates in the merged report are expected.** Lines of dual-tested files (as of 2026-07-18: `RouteView.ts` 57-59/116-118, `RealLink.ts` 107-110/141/151, `RealLinkActive.ts` 67/85) show as uncovered because the jit-emit maps them to ranges the aot-emit doesn't share; the aot map covers those same lines — verify with `pnpm test --project aot`. Don't chase these lines with more jit tests; they are unreachable there by construction. (The aot map has its own mirror artifacts — e.g. effect-call argument lines mapped oddly — covered by the jit side; only the UNION matters.)
- **`tests/aot/setup.ts` deliberately does NOT import `@angular/compiler`** — a present JIT compiler could mask a silent AOT-transform failure behind a partial JIT fallback. The K0 canary (`notFounds()` length) fails loudly instead.

**What IS covered:**

- `RouteView` fallback-template resolution (Self/NotFound arms incl. the #1439 first-wins duplicate semantics) — by the **aot project**, mutation-validated (`.at(0)→.at(-1)` REDs exactly {M1, M2})
- `RealLink` / `RealLinkActive` signal-input paths — by the **aot project** (`tests/aot/directives.aot.test.ts`): href from a real `[routeName]` binding, active-flip class toggles via the source subscription (also covering `subscribeSourceToSignal`'s emission callback), the pure-href-refresh early return, and the stale-`activeClassName` removal (mutation-validated: disabling `classList.remove` REDs exactly that fixture)
- Full `provideRealRouter` / `provideRealRouterFactory` DI wiring (incl. the scrollSpy initializer and the no-window `deriveStartPath` fallback)
- `sourceToSignal` bridge including rapid emissions and destroy-during-emission
- All public `inject*` functions with positive and negative cases
- `RouterErrorBoundary` 100% coverage via public API access (`boundary.errorContext()`, `boundary.onError.subscribe()`)
- `src/dom-utils/` — 100% across all four metrics in the jit map (incl. `buildHref` defensive arms, scroll-restore reload/hash edge branches, the #781 stale-timer guard)

**Paths to true 100% (deliberately not pursued):**

1. Evict each Angular-entity file's tests wholly into the aot project (removes the jit-emit twin problem) — days of migration, kills the still-valid "JIT: empty" pins, and AOT-emit phantom branches would still block 100% branches.
2. Refactor directives to extract logic into pure functions. Breaks component architecture.
3. Access private fields via `(directive as any).isActive.set(...)`. Violates "test only public API" principle.
4. Re-add targeted `v8 ignore` on merge-duplicate lines. Trades the honesty this whole effort restored for a number.

**Design decision:** We prioritize honest test coverage over artificially inflated numbers. Every semantic path is executed and asserted somewhere in the two-project run; the residual percentage is a measurement artifact of merging two compiler emits, documented above.

## SSR Support

Two complementary APIs for application bootstrap:

| API                                                       | Use case                                                                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `provideRealRouter(router)`                               | SPA, SSG client (post-hydrate), single-instance routing                                                                                   |
| `provideRealRouterFactory({ baseRouter, plugins, deps })` | Angular SSR (`@angular/ssr` + `outputMode: "server"`), SSG build-time render via `renderApplication`, multi-tenant request-scoped routing |

### When to choose `provideRealRouterFactory`

- Application uses `@angular/ssr` (`AngularNodeAppEngine` + `outputMode: "server"`) — Angular runtime owns the request lifecycle and exposes per-request deps via the `REQUEST: InjectionToken<Request | null>` token. A single `useValue` router cannot satisfy this.
- Application performs build-time SSG render via `renderApplication` (each URL needs its own router state with mocked REQUEST).
- Application requires request-scoped routing (multi-tenancy, cookies, headers).

For SPA / SSG-client-after-hydrate keep using `provideRealRouter(router)` — it has lower overhead (single-instance, no clone per request).

### How it works

```ts
provideRealRouterFactory({
  baseRouter: createBaseRouter(),
  plugins: (request) =>
    request
      ? [ssrDataPluginFactory(loaders)]
      : [browserPluginFactory(), ssrDataPluginFactory(loaders)],
  deps: (request) => ({
    currentUser: request
      ? parseCookieHeader(request.headers.get("cookie"))
      : parseCookieHeader(document.cookie),
  }),
});
```

Lifecycle per request (server / SSG):

1. `ROUTER` provider's `useFactory` runs — calls `inject(REQUEST, { optional: true })`, derives per-request deps via `deps?.(request)`, calls `cloneRouter(baseRouter, requestDeps)`, applies plugins via `usePlugin(...pluginList)`, registers `DestroyRef.onDestroy(() => router.dispose())`.
2. `NAVIGATOR` and `ROUTE` providers resolve from the per-request `ROUTER`.
3. `provideAppInitializer` awaits `router.start(url)` — `url` is derived from `request.url` on server / SSG, from `window.location` on client. Errors propagate (Option A — bootstrap fails → 500).
4. Components render with populated route state.
5. After response sent, application Injector destroys → `router.dispose()` runs → all subscriptions and plugins teardown.

### Plugin separation server vs client

Plugins that touch `window.history` / `window.location` (`browser-plugin`, `navigation-plugin`, `hash-plugin`) crash on the server. Use the **function form** of `plugins` to avoid this:

```ts
plugins: (request) => request
  ? [ssrDataPluginFactory(loaders)]
  : [browserPluginFactory(), ssrDataPluginFactory(loaders)],
```

The static form (`plugins: [a, b]`) applies the same set on both sides — only safe when no plugin is browser-only.

### Backward compatibility

`provideRealRouter(router)` is unchanged — all existing examples continue to work without modification. Both APIs ship in parallel; choose one for the entire application (mixing them on the same `ROUTER` token is undefined behavior).

### Post-hydration loader skip via TransferState bridge (#599)

`provideRealRouterFactory` automatically bridges Angular's `TransferState` to the cross-adapter hydration scratchpad established by #596:

- **Server pass** — after `await router.start(path)` resolves, the resulting state is serialized via `serializeRouterState(state)` and written to `TransferState` under the internal key `@real-router/angular:ssrState`. Angular's standard SSR pipeline embeds the entry as `<script id="ng-state" type="application/json">…</script>` in the response body (requires `provideServerRendering()` on server + `provideClientHydration()` on client — already standard for Angular SSR apps).
- **Client pass** — the same `provideAppInitializer` callback reads `TransferState`, finds the seeded JSON, and calls `hydrateRouter(router, ssrJson)` instead of `router.start(path)`. `hydrateRouter` deposits the parsed state into `RouterInternals.hydrationState`, and `ssr-data-plugin`'s start interceptor reuses the server-resolved `state.context.data` without re-invoking the loader on first paint.
- **Pure CSR** (no TransferState seed, `REQUEST` null) — falls back to `router.start(path)` with no write.

Parity with the other 5 adapters that consume `<script>window.__SSR_STATE__</script>` in their `entry-client.tsx`. The TransferState key is internal — no public API surface change.

### Examples

| Example                                                                                                     | Demonstrates                                                                                                                                                                     | E2e count |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| [`examples/web/angular/ssr-examples/ssr/`](../../examples/web/angular/ssr-examples/ssr)                     | Classical SSR — Express + AngularNodeAppEngine, per-request `provideRealRouterFactory`, cookie-based DI, auth guards (CANNOT_ACTIVATE → 302 middleware redirect), nested loaders | 50        |
| [`examples/web/angular/ssr-examples/ssr-mixed/`](../../examples/web/angular/ssr-examples/ssr-mixed)         | Mixed SSR/CSR — some routes server-rendered, others CSR-only                                                                                                                     | 8         |
| [`examples/web/angular/ssr-examples/ssr-streaming/`](../../examples/web/angular/ssr-examples/ssr-streaming) | Streaming SSR — `@defer (on viewport)` for Reviews, `@defer (on hover)` for RelatedItems, `withIncrementalHydration()` per-block lazy hydration                                  | 28        |
| [`examples/web/angular/ssr-examples/ssg/`](../../examples/web/angular/ssr-examples/ssg)                     | Static site generation — `getStaticPaths()` + in-process `AngularNodeAppEngine` on build-only port, per-page `<title>` + `<meta>`, `404.html`, `sitemap.xml`                     | 24        |

All four examples use `provideRealRouterFactory` (not `provideRealRouter`); existing 8 examples (`basic`, `combined`, `dynamic-routes`, `hash-routing`, `lazy-loading`, `nested-routes`, `persistent-params`, `animation-examples/*`) continue to use `provideRealRouter` for SPA scenarios — both APIs ship in parallel.

### Known constraints (documented in example READMEs)

1. **`@angular/router` peer dep with stub wildcard route** is required to satisfy `@angular/ssr`'s URL matching pipeline. Real-Router does the actual app routing via `<route-view>`; `@angular/router` is purely a placeholder. See `ssr/README.md` "Why provideRealRouterFactory" for the architectural rationale.
2. **`security.allowedHosts: ["localhost"]`** required in `angular.json` — Angular 22 SSR rejects unrecognized hosts by default (SSRF prevention).
3. **`server-runner.mjs` Node wrapper** for `ssr/` and `ssr-streaming/` — `outputMode: "server"` produces a `server.mjs` whose `isMainModule` check is fragile across @angular/ssr versions; the wrapper imports `app` from the compiled bundle and explicitly calls `listen()`.
4. **SSG `renderApplication` direct fails with NG0201** in @angular/ssr 21.2 (`platformProviders` REQUEST does not propagate cleanly into the application Injector when `provideRealRouterFactory` calls `inject(REQUEST, { optional: true })`). The `ssg/` example works around this by booting `server.mjs` in-process during build and `fetch`-ing each URL.
5. **`/admin` without auth returns 302** (custom middleware in `server.ts` catches `CANNOT_ACTIVATE` from `bootstrapApplication` rejection and issues `res.redirect(302, "/")`); **`/nonexistent` returns 200** with NotFound content (Real-Router's `allowNotFound: true` resolves `UNKNOWN_ROUTE` without throwing). See `ssr/README.md` "Known limitations".

### See Also

- RFC: `.claude/rfc-angular-ssr-factory-ru.md`
- Tracking issue: [#582](https://github.com/greydragon888/real-router/issues/582)
- ssr-examples follow-up: [#581](https://github.com/greydragon888/real-router/issues/581) (parent)
