# Architecture

> Angular 22 bindings for Real-Router with signal-based reactive state

## Package Dependencies

```
@real-router/angular
├── @real-router/core         # Router instance, Navigator, State types
├── @real-router/sources      # Subscription layer (createRouteSource, createRouteNodeSource, createActiveRouteSource, getTransitionSource, createDismissableError)
└── @real-router/route-utils  # Route tree queries (startsWithSegment)
```

## Entry Points

Two entry points (main + SSR-feature surface). The main entry stays
client-safe; the `/ssr` secondary entry holds components and functions that
depend on Angular SSR plumbing (`afterNextRender`, `TransferState`,
`HttpStatusSink`).

```
@real-router/angular        →  src/index.ts          →  Client API (Angular 22+)
@real-router/angular/ssr    →  ssr/public_api.ts     →  SSR-feature surface
```

**Build output** (ng-packagr, partial compilation):

```
dist/
├── fesm2022/
│   ├── real-router-angular.mjs
│   └── real-router-angular-ssr.mjs
├── esm2022/
│   └── (individual compiled files)
├── types/
│   ├── real-router-angular.d.ts
│   └── real-router-angular-ssr.d.ts
└── ssr/                       # ng-packagr secondary entry
```

ng-packagr produces FESM2022 bundles (ESM-only, no CJS). The `dom-utils` directory is an independent in-package copy of `shared/dom-utils/` — not a symlink (unlike the other framework adapters). The `prebundle` script copies `shared/dom-utils/` into `src/dom-utils/` before ng-packagr runs, because ng-packagr does not follow symlinks the same way tsdown does.

The `/ssr` subpath is built as a ng-packagr secondary entry point with its own `ssr/ng-package.json`. Importing from `@real-router/angular/ssr` does not pull SSR-only dependencies into client bundles.

## Source Structure

```
src/                            # Main entry — client API
├── index.ts                    # Public exports
├── providers.ts                # ROUTER, NAVIGATOR, ROUTE tokens + provideRealRouter
├── providersFactory.ts         # provideRealRouterFactory (SSR/SSG per-request clones)
├── sourceToSignal.ts           # Signal bridge — converts RouterSource<T> to Signal<T>
├── types.ts                    # RouteSignals, ErrorContext interfaces
├── functions/                  # 9 public inject* functions + 1 internal helper
│   ├── injectRouter.ts         # Router instance from inject (never reactive)
│   ├── injectNavigator.ts      # Navigator from inject (never reactive)
│   ├── injectRoute.ts          # Full route context from ROUTE token (every navigation)
│   ├── injectRouteNode.ts      # Node-scoped subscription via sourceToSignal
│   ├── injectRouteUtils.ts     # RouteUtils from route tree (never reactive)
│   ├── injectRouterTransition.ts  # Transition lifecycle Signal (isTransitioning, toRoute, fromRoute)
│   ├── injectIsActiveRoute.ts  # Active state Signal
│   ├── injectRouteExit.ts      # Wrap subscribeLeave with abort + same-route guards (cleanup via DestroyRef)
│   ├── injectRouteEnter.ts     # Fire on nav-driven mount via injectRoute() + effect() + transition.from
│   ├── injectOrThrow.ts        # Internal helper — non-null inject() wrapper
│   └── index.ts
├── internal/                   # Internal helpers (not re-exported from src/index.ts)
│   ├── install.ts              # installScrollRestoration + installViewTransitions — shared by providers + providersFactory
│   └── subscribeSourceToSignal.ts  # subscribe → setState → cleanup pattern used by RealLink/RealLinkActive/RouteView
├── directives/                 # Directives
│   ├── RouteMatch.ts           # ng-template[routeMatch] — segment marker
│   ├── RouteSelf.ts            # ng-template[routeSelf] — exact-match slot for the node itself
│   ├── RouteNotFound.ts        # ng-template[routeNotFound] — not-found marker
│   ├── RealLink.ts             # a[realLink] — navigation + active class
│   ├── RealLinkActive.ts       # [realLinkActive] — active class on any element
│   └── index.ts
├── components/                 # Components
│   ├── RouteView.ts            # Declarative route matching via ng-template
│   ├── RouterErrorBoundary.ts  # Navigation error handling
│   ├── NavigationAnnouncer.ts  # WCAG aria-live announcer
│   └── index.ts
└── dom-utils/                  # Shared DOM utilities (prebuild copy of shared/)
    ├── link-utils.ts           # buildHref, buildActiveClassName, applyLinkA11y, shouldNavigate, navigateWithHash, shallowEqual
    ├── route-announcer.ts      # createRouteAnnouncer
    ├── scroll-restore.ts       # createScrollRestoration (opt-in scroll capture + restore)
    ├── view-transitions.ts     # createViewTransitions (opt-in View Transitions API integration)
    ├── direction-tracker.ts    # createDirectionTracker — optional public utility (not re-exported from src/index.ts)
    └── index.ts

ssr/                            # SSR-feature entry — @real-router/angular/ssr
├── public_api.ts               # Public exports (8 names + 1 type)
├── ng-package.json             # ng-packagr secondary entry-point config
├── components/
│   ├── ClientOnly.ts           # <client-only [fallback]="tpl"> — server emits fallback, client swaps after afterNextRender
│   ├── ServerOnly.ts           # <server-only> — symmetric inverse of ClientOnly
│   └── HttpStatusCode.ts       # <http-status-code [code]="N"> — writes to optional HttpStatusSink
├── functions/
│   ├── injectDeferred.ts       # Reads state.context.ssrDataDeferred[key] from ssr-data-plugin
│   └── provideHttpStatusSink.ts  # Environment providers helper for HTTP_STATUS_SINK
└── utils/
    └── createHttpStatusSink.ts # HTTP_STATUS_SINK + createHttpStatusSink — request-scoped sink
```

## Key Differences from React, Preact, Solid, and Vue Adapters

| Aspect                | React                            | Solid                            | Vue                                   | Angular                                                     |
| --------------------- | -------------------------------- | -------------------------------- | ------------------------------------- | ----------------------------------------------------------- |
| Reactivity model      | Re-renders (virtual DOM)         | Fine-grained signals             | Proxy-based refs                      | Angular signals (zoneless-compatible)                       |
| External store bridge | `useSyncExternalStore`           | `createSignalFromSource`         | `useRefFromSource` (shallowRef)       | `sourceToSignal` (signal + DestroyRef)                      |
| Hook/function return  | Values (`RouteState`)            | Accessors (`Accessor<T>`)        | `{ navigator, route: Ref }`           | `{ navigator, routeState: Signal<RouteSnapshot> }`          |
| Context mechanism     | `createContext` + Provider       | `createContext` + Provider       | `provide` / `inject` + `InjectionKey` | `InjectionToken` + `provideRealRouter`                      |
| Context count         | 3                                | 2                                | 3                                     | 3                                                           |
| Components            | JSX (.tsx)                       | JSX (.tsx)                       | `defineComponent` + `h()` (.ts)       | `@Component` decorators (.ts)                               |
| Directives            | N/A                              | N/A                              | `v-link` (custom directive)           | `realLink`, `realLinkActive`, `routeMatch`, `routeNotFound` |
| Route matching        | `RouteView.Match` (JSX children) | `RouteView.Match` (JSX children) | `RouteView.Match` (VNode type check)  | `ng-template[routeMatch]` (content children)                |
| Build tool            | tsdown                           | rollup + babel-preset-solid      | tsdown                                | ng-packagr (partial compilation)                            |
| Output format         | ESM + CJS                        | ESM + CJS                        | ESM + CJS                             | FESM2022 (ESM-only)                                         |
| Peer dependency       | `react` >= 19.0.0                | `solid-js` >= 1.7.0              | `vue` >= 3.3.0                        | `@angular/core` >= 22.0.0                                   |
| `keepAlive`           | React 19.2+ Activity             | Not available                    | Vue native `<KeepAlive>`              | Not available                                               |
| RxJS                  | No                               | No                               | No                                    | No (signal-first)                                           |

### sourceToSignal

Angular has no `useSyncExternalStore`. The bridge in `src/sourceToSignal.ts` uses Angular's `signal` + `DestroyRef`:

1. `signal(source.getSnapshot())` — initial value from the store
2. `source.subscribe(callback)` — calls `sig.set(source.getSnapshot())` on store change
3. `inject(DestroyRef).onDestroy(unsubscribe)` — cleans up when the injection context is destroyed
4. Returns `sig.asReadonly()` — callers get a read-only signal

`sourceToSignal` must be called within an injection context (constructor, field initializer, or `runInInjectionContext`). This is the idiomatic Angular pattern for bridging external subscriptions into the signal graph.

## Context Architecture

Three `InjectionToken` values serve different update frequencies:

```
provideRealRouter(router)
├── { provide: ROUTER, useValue: router }                    # Stable — never changes
├── { provide: NAVIGATOR, useValue: navigator }              # Stable — derived from router
└── { provide: ROUTE, useFactory: () => {                   # Reactive — Signal updates on navigation
      routeState: Signal<RouteSnapshot>,
      navigator: Navigator
    }}
```

**Why three tokens, not two:**

Separating `ROUTER` and `NAVIGATOR` keeps each injection point focused. `ROUTE` carries the reactive `Signal<RouteSnapshot>` alongside the stable `navigator` reference for convenience — matching the `RouteSignals` interface returned by `injectRoute()` and `injectRouteNode()`.

| Token       | Value                                              | Reactive?                          | Consumers                                                                                               |
| ----------- | -------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `ROUTER`    | `Router` instance                                  | No — stable object reference       | `injectRouter`, `injectRouteUtils`, `injectRouterTransition`, `injectRouteNode`, directives, components |
| `NAVIGATOR` | `Navigator`                                        | No — stable object reference       | `injectNavigator`                                                                                       |
| `ROUTE`     | `RouteSignals` (`routeState: Signal`, `navigator`) | Yes — signal updates on navigation | `injectRoute`                                                                                           |

## Subscription Patterns

### Token-Based (via `inject()`)

```
injectRoute()      — reads ROUTE token → returns RouteSignals (routeState: Signal, navigator)
injectRouter()     — reads ROUTER token → returns Router, never reactive
injectNavigator()  — reads NAVIGATOR token → returns Navigator, never reactive
```

### Signal-Based (via sourceToSignal)

```
injectRouteNode(name)       — cached createRouteNodeSource(router, name)    → RouteSignals
injectRouterTransition()    — cached getTransitionSource(router)            → Signal<RouterTransitionSnapshot>
injectIsActiveRoute(...)    — cached createActiveRouteSource(router, ...)   → Signal<boolean>
provideRealRouter (ROUTE)   — createRouteSource(router)                     → Signal<RouteSnapshot>
```

**`sourceToSignal.destroy()` safety:** `sourceToSignal` calls `source.destroy()` in `DestroyRef.onDestroy`. For cached sources from `@real-router/sources` (`getTransitionSource`, `createDismissableError`, cached `createRouteNodeSource`, cached `createActiveRouteSource`), the returned wrapper has a no-op `destroy()` — so multiple components can safely share the same cached source without tearing it down on the first unmount. For non-cached sources (`createRouteSource`, `createTransitionSource`, `createErrorSource` called directly), `destroy()` performs real teardown.

## Component Architecture

### RouteView

`RouteView` uses Angular's `contentChildren` query to collect `RouteMatch`, `RouteSelf`, and `RouteNotFound` directive instances. Each directive holds a `TemplateRef` injected from its host `ng-template`. The component creates a `createRouteNodeSource` inside an `effect(...)` scheduled from the **constructor** (#630 — signal inputs are readable inside `effect()` at first run), stores snapshots in a local `signal<RouteSnapshot>`, and derives `activeTemplate` via two split computeds:

```
RouteView (@Component, selector: route-view)
├── nodeName = input<string>("", { alias: "routeNode" })   # aliased to avoid HTMLElement.nodeName collision
├── matches = contentChildren(RouteMatch)                  # ng-template[routeMatch] directives
├── selfs = contentChildren(RouteSelf)                     # ng-template[routeSelf] directives (exact-match for the node itself)
├── notFounds = contentChildren(RouteNotFound)             # ng-template[routeNotFound] directives
├── routeState = signal<RouteSnapshot>(EMPTY_SNAPSHOT)     # local state, updated by source subscription
├── effect((onCleanup) => createRouteNodeSource + subscribeSourceToSignal + onCleanup)  # reactive to nodeName()
├── matchedTemplate = computed(() => /* Match priority loop */)
├── fallbackTemplate = computed(() => /* Self → NotFound fallback chain */)
└── activeTemplate = computed(() => matchedTemplate() ?? fallbackTemplate())
```

**Template priority:** `Match` (segment prefix) → `Self` (exact-match for `nodeName`) → `NotFound` (UNKNOWN_ROUTE only). First-wins for matches/selfs, last-wins for notFounds — mirrors React/Preact/Solid/Vue contentChildren-resolution semantics adapted to Angular.

Template renders `<ng-container [ngTemplateOutlet]="activeTemplate()">` — only the matched template is instantiated.

### RouterErrorBoundary

```
RouterErrorBoundary (@Component, selector: router-error-boundary)
├── errorTemplate = input<TemplateRef<ErrorContext>>()            # optional error template
├── onError = output<{ error, toRoute, fromRoute }>()             # event emitter
├── snapshot = sourceToSignal(createDismissableError(router))     # Signal<DismissableErrorSnapshot>, shared per-router
│             (integrated dismissedVersion + resetError — no local state)
├── errorContext = computed<ErrorContext>(() => ({ $implicit: snap.error, resetError: snap.resetError }))
└── effect(() => { if snap.error → onError.emit(...) })
```

Template renders `<ng-content>` (always) plus the error template alongside it when `errorContext()` (which internally depends on `visibleError()`) is truthy. `resetError` is a stable class-field reference so `errorContext` does not reallocate the closure on each recomputation.

### NavigationAnnouncer

Minimal component. Constructor injects `injectRouter()` and `inject(DestroyRef)`, calls `createRouteAnnouncer(router)` from `dom-utils`, and registers `announcer.destroy()` on `DestroyRef`. No template content — the announcer creates its own `aria-live` DOM node.

### Scroll Restoration

Opt-in via `provideRealRouter(router, { scrollRestoration })`. Not a component — wired through `provideEnvironmentInitializer`: when the environment injector is created (first `inject()` call), the initializer runs `createScrollRestoration(router, options)` from `shared/dom-utils/` and registers `sr.destroy()` on `inject(DestroyRef)`. Options are a bootstrap-time snapshot, not reactive to runtime changes. Lifecycle is tied to the environment injector — destroy fires on `TestBed.resetTestingModule()` / application teardown.

### View Transitions

Opt-in via `provideRealRouter(router, { viewTransitions: true })`. Same wiring pattern as Scroll Restoration: `provideEnvironmentInitializer` runs `createViewTransitions(router)` from `shared/dom-utils/` and registers `vt.destroy()` on `inject(DestroyRef)`. The utility subscribes to `router.subscribeLeave` (opens `document.startViewTransition` with a deferred async callback) and `router.subscribe` (resolves the deferred via a `setTimeout(0)` so the new-DOM snapshot capture runs after Angular commits — `rAF` is suppressed during VT's `update-callback-called` phase). No-op when `document.startViewTransition` is unavailable (SSR, Firefox as of 2026-04). On teardown, `destroy()` calls `skipTransition()` on any in-flight VT. Option is a bootstrap-time snapshot — toggling requires re-bootstrap.

**Angular-specific tick:** the same initializer also installs a `router.subscribe` listener that calls `applicationRef.tick()` synchronously before the VT utility resolves its deferred. Angular's zoneless change detection is `rAF`-driven and is therefore blocked while VT sits in `update-callback-called`; without a forced synchronous tick the new DOM is not committed when the browser captures the new snapshot, so old and new snapshots end up identical and animations finish in ~0 ms with no visible work. Subscribers fire in registration order, so this listener runs before the VT utility's own subscriber.

### Route Exit / Entry Hooks

`injectRouteExit(handler, options?)` and `injectRouteEnter(handler, options?)` mirror the React `useRouteExit` / `useRouteEnter` API in idiomatic Angular form (must be called inside an injection context).

- **`injectRouteExit`** wraps `router.subscribeLeave` with the universal guards: reentrant abort pre-check, same-route skip default. Cleanup is bound to the injection context's `DestroyRef`. Handler can return a `Promise` — the router awaits it before committing the new state, giving router-coordinated exit timing for animations or auto-save scenarios.
- **`injectRouteEnter`** fires once when the component is created as a result of a navigation. Skip-initial via `route.transition.from` (undefined on the very first state); skip-same-route via `transition.from === route.name`. Reads from `injectRoute()` inside `effect()`; the effect is owned by the active context's `DestroyRef`.

**Handler-reactivity caveat:** `inject*` functions run **once** during component construction; the handler is captured at injection time and is NOT swapped between change-detection cycles. The common pattern is to pass a class method (or arrow-property) — its identity is stable. To vary behavior over time, read signals **inside** the handler body. This contrasts with React/Preact, where the hook keeps a `handlerRef` updated on every render.

### RealLink

```
RealLink (@Directive, selector: a[realLink])
├── routeName, routeParams, routeOptions, activeClassName, activeStrict, ignoreQueryParams, hash = input()
├── isActive = signal(false)                               # local active state
├── stableParams = createStableParams(routeParams)         # shallowEqual content-stabilization (#988)
├── href = computed(() => buildHref(..., stableParams()))  # primitive-string output; Object.is dedup
├── prevActive, prevHref, prevActiveClass                  # skip-same-value caches (audit §8b)
├── effect((onCleanup) => createActiveRouteSource(..., stableParams()) + subscribeSourceToSignal + skip-same-value branch)
├── updateHref() → el.setAttribute("href", ...) iff href !== prevHref
├── updateActiveClass() → classList.toggle(activeClass, isActive()) iff active flipped
└── onClick(event) → shouldNavigate(event) ∧ target≠"_blank" → navigateWithHash(...).catch(NOOP_CATCH)
```

Subscription setup runs inside `effect(...)` scheduled from the **constructor** (#630) — signal inputs are readable inside the effect's first execution, so reading `routeName()`/`stableParams()`/`hash()` makes the source creation reactive. The previous `ngOnInit` pattern captured inputs once at mount and silently drifted under AOT signal-input bindings. `routeParams` is routed through `createStableParams` (`computed` + `shallowEqual`) so an inline `[routeParams]="{ id: 1 }"` literal re-allocated on every change detection does not re-create the source or re-run `buildHref` until the param content actually changes (#988 — mirrors the Vue `<Link>` fix; behavior unchanged, stabilized params are always content-equal).

### RealLinkActive

Same subscription pattern as `RealLink` (constructor `effect()` + `subscribeSourceToSignal` helper + skip-same-value `prevActive` + `createStableParams` content-stabilization of `routeParams`, #988). Applies a CSS class to any element (not just `<a>`) via `classList.toggle`. Calls `applyLinkA11y` in the constructor to set `role="link"` and `tabindex="0"` on non-interactive elements (skip-list: `<a>`, `<button>` — see [audit §5.2 Bug 4](.claude/review-2026-05-16.md) for the known a11y limitation on `<details>` / `<summary>` / native interactive elements).

## Build Notes

**ng-packagr** compiles the package in partial compilation mode (Ivy linker format). This produces:

- FESM2022 bundles — flat ESM, no CommonJS output
- Partial compilation artifacts — linked at application build time by the consumer's Angular compiler
- No Zone.js dependency — signal-first, compatible with `provideExperimentalZonelessChangeDetection()`

**dom-utils prebuild copy:** The `src/dom-utils/` directory is a git-tracked copy of `shared/dom-utils/` — not a symlink (root `CLAUDE.md` calls this out explicitly for the Angular adapter). The `prebundle` script re-materializes the copy before every bundle to keep it in sync with `shared/dom-utils/`. ng-packagr does not follow symlinks the same way tsdown does, so the sources are copied into the package before compilation.

**JIT mode limitation:** Angular 22 JIT mode (used in TestBed without `@analogjs/vite-plugin-angular`) does not support signal-based `input()` in template bindings. Full template compilation in tests requires the Analog Vite plugin.

## Data Flow

```
router.navigate("users.profile", { id: "123" })
    │
    ▼
@real-router/core (transition pipeline, guards, state update)
    │
    ▼
router emits TRANSITION_SUCCESS
    │
    ├──► createRouteSource.subscribe callback → new RouteSnapshot
    │       └──► ROUTE token signal.set(snapshot)
    │               └──► injectRoute() consumers re-evaluate (computed/effect/template)
    │
    ├──► createRouteNodeSource.subscribe callback → shouldUpdateNode() filter
    │       └──► if node relevant: RouteView routeState.set(snapshot)
    │               └──► activeTemplate computed re-evaluates → ngTemplateOutlet updates
    │
    └──► createActiveRouteSource.subscribe callback → boolean snapshot
            └──► if changed: RealLink isActive.set(true/false) → updateDom() → el.className
```

## Testing Strategy

```
tests/
├── functional/           # Unit tests per function/component/directive
└── setup.ts              # Angular TestBed + JSDOM environment setup
```

**Coverage thresholds:** 94% statements, 84% branches, 94% functions, 94% lines (enforced in `vitest.config.mts`). `src/dom-utils/direction-tracker.ts` is excluded from coverage — coverage for the canonical shared source (`shared/dom-utils/direction-tracker.ts`) lives in `packages/react/` (react is its measuring owner after the node→consumer migration, #1065).

**Why not 100%:** Angular 22 JIT mode (TestBed without `@analogjs/vite-plugin-angular`) does not compile signal-based `input()` template bindings. This makes ~15 lines across `RouteView`, `RealLink`, `RealLinkActive` unreachable from tests — specifically the subscription callbacks, DOM update branches, and `contentChildren`-driven template matching. These paths execute correctly at runtime with AOT compilation in real apps, but cannot be triggered in JIT-based unit tests without installing the AOT vite plugin (~30 packages of tooling) or refactoring directives to expose internals. See CLAUDE.md "Coverage Ceiling" section for the full analysis.

## See Also

- [CLAUDE.md](CLAUDE.md) — Quick reference for AI agents (exports table, gotchas, Angular-specific patterns)
- [Root ARCHITECTURE.md](../../ARCHITECTURE.md) — Monorepo-level architecture
