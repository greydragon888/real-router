# Architecture

> Angular 21 bindings for Real-Router with signal-based reactive state

## Package Dependencies

```
@real-router/angular
├── @real-router/core         # Router instance, Navigator, State types
├── @real-router/sources      # Subscription layer (createRouteSource, createRouteNodeSource, createActiveRouteSource, createErrorSource)
└── @real-router/route-utils  # Route tree queries (startsWithSegment)
```

## Single Entry Point

One entry point. No modern/legacy split.

```
@real-router/angular  →  src/index.ts  →  Full API (Angular 21+)
```

**Build output** (ng-packagr, partial compilation):

```
dist/
├── fesm2022/
│   └── real-router-angular.mjs
├── esm2022/
│   └── (individual compiled files)
└── index.d.ts
```

ng-packagr produces FESM2022 bundles (ESM-only, no CJS). The `dom-utils` directory is an independent in-package copy of `shared/dom-utils/` — not a symlink (unlike the other framework adapters). The `prebundle` script copies `shared/dom-utils/` into `src/dom-utils/` before ng-packagr runs, because ng-packagr does not follow symlinks the same way tsdown does.

## Source Structure

```
src/
├── index.ts                    # Single entry point
├── providers.ts                # ROUTER, NAVIGATOR, ROUTE tokens + provideRealRouter
├── sourceToSignal.ts           # Signal bridge — converts RouterSource<T> to Signal<T>
├── types.ts                    # RouteSignals interface
├── functions/                  # All inject* functions
│   ├── injectRouter.ts         # Router instance from inject (never reactive)
│   ├── injectNavigator.ts      # Navigator from inject (never reactive)
│   ├── injectRoute.ts          # Full route context from ROUTE token (every navigation)
│   ├── injectRouteNode.ts      # Node-scoped subscription via sourceToSignal
│   ├── injectRouteUtils.ts     # RouteUtils from route tree (never reactive)
│   ├── injectRouterTransition.ts  # Transition lifecycle Signal (isTransitioning, toRoute, fromRoute)
│   ├── injectIsActiveRoute.ts  # Active state Signal
│   └── index.ts
├── directives/                 # Directives
│   ├── RouteMatch.ts           # ng-template[routeMatch] — segment marker
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
    ├── link-utils.ts           # buildHref, buildActiveClassName, applyLinkA11y, shouldNavigate
    ├── route-announcer.ts      # createRouteAnnouncer
    └── index.ts
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
| Peer dependency       | `react` >= 19.0.0                | `solid-js` >= 1.7.0              | `vue` >= 3.3.0                        | `@angular/core` >= 21.0.0                                   |
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

**`sourceToSignal.destroy()` safety:** `sourceToSignal` calls `source.destroy()` in `DestroyRef.onDestroy`. For cached sources from `@real-router/sources` (`getTransitionSource`, `getErrorSource`, cached `createRouteNodeSource`, cached `createActiveRouteSource`), the returned wrapper has a no-op `destroy()` — so multiple components can safely share the same cached source without tearing it down on the first unmount. For non-cached sources (`createRouteSource`, `createTransitionSource`, `createErrorSource` called directly), `destroy()` performs real teardown.

## Component Architecture

### RouteView

`RouteView` uses Angular's `contentChildren` query to collect `RouteMatch` and `RouteNotFound` directive instances. Each directive holds a `TemplateRef` injected from its host `ng-template`. The component creates a `createRouteNodeSource` in `ngOnInit` (not the constructor — signal inputs aren't available yet), stores snapshots in a local `signal<RouteSnapshot>`, and derives `activeTemplate` via `computed`:

```
RouteView (@Component, selector: route-view)
├── nodeName = input<string>("", { alias: "routeNode" })   # aliased to avoid HTMLElement.nodeName collision
├── matches = contentChildren(RouteMatch)                  # ng-template[routeMatch] directives
├── notFounds = contentChildren(RouteNotFound)             # ng-template[routeNotFound] directives
├── routeState = signal<RouteSnapshot>(EMPTY_SNAPSHOT)     # local state, updated by source subscription
├── ngOnInit → createRouteNodeSource + subscribe + destroyRef.onDestroy(unsub)
└── activeTemplate = computed(() => {
      for match of matches: startsWithSegment(routeName, fullSegmentName) → match.templateRef
      if UNKNOWN_ROUTE: last notFound.templateRef
    })
```

Template renders `<ng-container [ngTemplateOutlet]="activeTemplate()">` — only the matched template is instantiated.

### RouterErrorBoundary

```
RouterErrorBoundary (@Component, selector: router-error-boundary)
├── errorTemplate = input<TemplateRef<ErrorContext>>()     # optional error template
├── onError = output<{ error, toRoute, fromRoute }>()      # event emitter
├── snapshot = sourceToSignal(getErrorSource(router))      # Signal<RouterErrorSnapshot>, shared per-router
├── dismissedVersion = signal(-1)                          # tracks manually dismissed errors
├── visibleError = computed(() => snap.version > dismissedVersion ? snap.error : null)
├── errorContext = computed<ErrorContext>(() => ({ $implicit: error, resetError }))
└── effect(() => { if snap.error → onError.emit(...) })
```

Template renders `<ng-content>` (always) plus the error template alongside it when `errorContext()` (which internally depends on `visibleError()`) is truthy. `resetError` is a stable class-field reference so `errorContext` does not reallocate the closure on each recomputation.

### NavigationAnnouncer

Minimal component. Constructor injects `injectRouter()` and `inject(DestroyRef)`, calls `createRouteAnnouncer(router)` from `dom-utils`, and registers `announcer.destroy()` on `DestroyRef`. No template content — the announcer creates its own `aria-live` DOM node.

### RealLink

```
RealLink (@Directive, selector: a[realLink])
├── routeName, routeParams, routeOptions, activeClassName, activeStrict, ignoreQueryParams = input()
├── isActive = signal(false)                               # local active state
├── ngOnInit → createActiveRouteSource + subscribe + destroyRef.onDestroy(unsub)
├── updateDom() → buildHref(router, routeName, routeParams) → el.setAttribute("href", ...)
│              → classList.add/remove(activeClassName) based on isActive state
└── onClick(event) → shouldNavigate(event) ∧ target≠"_blank" → router.navigate(...).catch(() => {})
```

Subscription setup is deferred to `ngOnInit` because signal inputs are not available in the constructor.

### RealLinkActive

Same subscription pattern as `RealLink`. Applies a CSS class to any element (not just `<a>`) via `classList.add/remove`. Calls `applyLinkA11y` in the constructor to set `role="link"` and `tabindex="0"` on non-interactive elements.

## Build Notes

**ng-packagr** compiles the package in partial compilation mode (Ivy linker format). This produces:

- FESM2022 bundles — flat ESM, no CommonJS output
- Partial compilation artifacts — linked at application build time by the consumer's Angular compiler
- No Zone.js dependency — signal-first, compatible with `provideExperimentalZonelessChangeDetection()`

**dom-utils prebuild copy:** The `src/dom-utils/` directory is a git-tracked copy of `shared/dom-utils/` — not a symlink (root `CLAUDE.md` calls this out explicitly for the Angular adapter). The `prebundle` script re-materializes the copy before every bundle to keep it in sync with `shared/dom-utils/`. ng-packagr does not follow symlinks the same way tsdown does, so the sources are copied into the package before compilation.

**JIT mode limitation:** Angular 21 JIT mode (used in TestBed without `@analogjs/vite-plugin-angular`) does not support signal-based `input()` in template bindings. Full template compilation in tests requires the Analog Vite plugin.

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

**Coverage thresholds:** 95% statements, 86% branches, 95% functions, 95% lines (enforced in vitest.config.mts).

**Why not 100%:** Angular 21 JIT mode (TestBed without `@analogjs/vite-plugin-angular`) does not compile signal-based `input()` template bindings. This makes ~15 lines across `RouteView`, `RealLink`, `RealLinkActive` unreachable from tests — specifically the subscription callbacks, DOM update branches, and `contentChildren`-driven template matching. These paths execute correctly at runtime with AOT compilation in real apps, but cannot be triggered in JIT-based unit tests without installing the AOT vite plugin (~30 packages of tooling) or refactoring directives to expose internals. See CLAUDE.md "Coverage Ceiling" section for the full analysis.

## See Also

- [CLAUDE.md](CLAUDE.md) — Quick reference for AI agents (exports table, gotchas, Angular-specific patterns)
- [Root ARCHITECTURE.md](../../ARCHITECTURE.md) — Monorepo-level architecture
