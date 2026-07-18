# @real-router/angular

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Angular 22 integration for [Real-Router](https://github.com/greydragon888/real-router) — inject functions, components, and directives.

## Installation

```bash
npm install @real-router/angular @real-router/core @real-router/browser-plugin
```

**Peer dependencies:** `@angular/core` >= 22.0.0, `@angular/common` >= 22.0.0

## Quick Start

Bootstrap a standalone Angular application with `provideRealRouter`:

```typescript
import { bootstrapApplication } from "@angular/platform-browser";
import { createRouter } from "@real-router/core";
import { browserPluginFactory } from "@real-router/browser-plugin";
import { provideRealRouter } from "@real-router/angular";
import { AppComponent } from "./app.component";

const router = createRouter([
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
]);

router.usePlugin(browserPluginFactory());
await router.start();

bootstrapApplication(AppComponent, {
  providers: [provideRealRouter(router)],
});
```

> **Lifecycle:** `provideRealRouter(router)` expects a router that has already been started — `await router.start()` MUST run before `bootstrapApplication`. For SSR / SSG, use [`provideRealRouterFactory`](#server-side-rendering) instead — it accepts a non-started `baseRouter` and runs `router.start(url)` itself via `provideAppInitializer`, deriving the URL from Angular's `REQUEST` token.

Then use `injectRoute` and `RouteView` in your root component:

```typescript
import { Component } from "@angular/core";
import {
  injectRoute,
  RouteView,
  RouteMatch,
  RouteNotFound,
  RealLink,
} from "@real-router/angular";

@Component({
  selector: "app-root",
  imports: [RouteView, RouteMatch, RouteNotFound, RealLink],
  template: `
    <nav>
      <a realLink routeName="home">Home</a>
      <a realLink routeName="users">Users</a>
    </nav>

    <route-view [routeNode]="''">
      <ng-template routeMatch="home">
        <app-home />
      </ng-template>
      <ng-template routeMatch="users">
        <app-users-layout />
      </ng-template>
      <ng-template routeNotFound>
        <app-not-found />
      </ng-template>
    </route-view>
  `,
})
export class AppComponent {
  readonly route = injectRoute();
}
```

For nested children (e.g., `users.profile`), place another `<route-view>` inside the parent layout and set `routeNode` to the parent's name:

```typescript
@Component({
  selector: "app-users-layout",
  imports: [RouteView, RouteMatch],
  template: `
    <h1>Users</h1>
    <route-view [routeNode]="'users'">
      <ng-template routeMatch="profile">
        <app-user-profile />
      </ng-template>
    </route-view>
  `,
})
export class UsersLayoutComponent {}
```

## Functions

All inject functions must be called within an injection context (constructor, field initializer, or `runInInjectionContext`). Route state functions return `RouteSignals` — an object with a `routeState` signal and a stable `navigator` reference.

| Function                                    | Returns                                                                    | Reactive?                                                                                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `injectRouter()`                            | `Router`                                                                   | Never                                                                                                                                                          |
| `injectNavigator()`                         | `Navigator`                                                                | Never                                                                                                                                                          |
| `injectRoute()`                             | `RouteSignals`                                                             | `routeState` on every navigation                                                                                                                               |
| `injectRouteNode(name)`                     | `RouteSignals`                                                             | When the node subtree is entered, left, or changes between descendants (uses `shouldUpdateNode` — sibling-leaf transitions within the same subtree still fire) |
| `injectRouteUtils()`                        | `RouteUtils`                                                               | Never                                                                                                                                                          |
| `injectRouterTransition()`                  | `Signal<RouterTransitionSnapshot>`                                         | On transition start/end                                                                                                                                        |
| `injectIsActiveRoute(name, params?, opts?)` | `Signal<boolean>`                                                          | On active state change                                                                                                                                         |
| `injectRouteExit(handler, options?)`        | `void` — wraps `subscribeLeave` with abort + same-route guards             | Never (handler captured at injection time)                                                                                                                     |
| `injectRouteEnter(handler, options?)`       | `void` — fires once on nav-driven mount via `effect()` + `transition.from` | Never (handler captured at injection time)                                                                                                                     |

`RouteSignals` shape:

```typescript
interface RouteSignals {
  readonly routeState: Signal<RouteSnapshot>; // { route, previousRoute }
  readonly navigator: Navigator;
}
```

```typescript
// injectRouteNode — updates only when "users.*" changes
@Component({
  selector: "app-users-layout",
  template: `
    @if (route.routeState().route; as r) {
      @switch (r.name) {
        @case ("users") {
          <app-users-list />
        }
        @case ("users.profile") {
          <app-user-profile [id]="r.params['id']" />
        }
      }
    }
  `,
})
export class UsersLayoutComponent {
  readonly route = injectRouteNode("users");
}

// injectNavigator — stable reference, never reactive
@Component({
  selector: "app-back-button",
  template: `<button (click)="goHome()">Back</button>`,
})
export class BackButtonComponent {
  private readonly navigator = injectNavigator();

  goHome(): void {
    this.navigator.navigate("home");
  }
}

// injectRouterTransition — progress bars, loading states
@Component({
  selector: "app-progress",
  template: `
    @if (transition().isTransitioning) {
      <div class="progress-bar"></div>
    }
  `,
})
export class ProgressComponent {
  readonly transition = injectRouterTransition();
}

// injectRouteExit — exit animations, draft autosave, AbortSignal-aware cleanup
@Component({
  selector: "app-fade-out",
  template: `<div #box>...</div>`,
})
export class FadeOutComponent {
  private el = viewChild.required<ElementRef<HTMLDivElement>>("box");

  constructor() {
    injectRouteExit(async ({ signal }) => {
      const el = this.el().nativeElement;
      el.classList.add("fade-out");
      const cleanup = () => el.classList.remove("fade-out");
      signal.addEventListener("abort", cleanup, { once: true });
      el.getBoundingClientRect(); // style flush
      await Promise.allSettled(el.getAnimations().map((a) => a.finished));
      cleanup();
    });
  }
}

// injectRouteEnter — page-enter analytics, focus management, entry animations
@Component({ selector: "app-page-enter", template: "" })
export class PageEnterAnalyticsComponent {
  constructor() {
    injectRouteEnter(({ route, previousRoute }) => {
      analytics.track("page_enter", {
        route: route.name,
        from: previousRoute.name,
      });
    });
  }
}
```

> **Angular handler-reactivity:** `inject*` functions run once at construction,
> so `handler` is captured at injection time. Pass a class method (stable
> identity) and read signals **inside** the handler body to react to changes.
> See [CLAUDE.md](./CLAUDE.md) → "injectRouteExit / injectRouteEnter Handler
> Is Captured At Injection Time".

## Components

### `<route-view>`

Declarative route matching. Renders the first `ng-template[routeMatch]` whose segment matches the active route.

```html
<route-view [routeNode]="''">
  <ng-template routeMatch="users">
    <app-users />
  </ng-template>
  <ng-template routeMatch="settings">
    <app-settings />
  </ng-template>
  <ng-template routeNotFound>
    <app-not-found />
  </ng-template>
</route-view>
```

The `routeNode` input (aliased from `nodeName`) scopes the view to a subtree. Pass `""` for the root level, or a route name like `"users"` for nested layouts:

```html
<!-- Nested layout: renders when any "users.*" route is active -->
<route-view [routeNode]="'users'">
  <ng-template routeMatch="profile">
    <app-user-profile />
  </ng-template>
</route-view>
```

> **Note:** The input is named `routeNode` (not `nodeName`) because `nodeName` is a read-only property on `HTMLElement`. Angular's template binding would fail with the unaliased name.

### `<router-error-boundary>`

Declarative error handling for navigation errors. Renders its content normally and shows an error template alongside it when a guard rejects or a route is not found.

```typescript
import { RouterErrorBoundary, type ErrorContext } from "@real-router/angular";
```

```html
<router-error-boundary
  [errorTemplate]="errorTpl"
  (onError)="onNavError($event)"
>
  <a realLink routeName="protected">Go to Protected</a>
</router-error-boundary>

<ng-template #errorTpl let-error let-reset="resetError">
  <div class="toast">
    {{ error.code }}
    <button (click)="reset()">Dismiss</button>
  </div>
</ng-template>
```

The template context is typed as `ErrorContext`:

```typescript
interface ErrorContext {
  $implicit: RouterError; // the navigation error
  resetError: () => void; // dismiss the error
}
```

Auto-resets on the next successful navigation. Works with both `realLink` and imperative `router.navigate()`.

### `<navigation-announcer>`

WCAG-compliant screen reader announcements for route changes. Add it once near the root of your application:

```html
<navigation-announcer />
```

See the [Accessibility](#accessibility) section for details.

### `<client-only>` / `<server-only>` (`@real-router/angular/ssr`)

Paired SSR-aware boundaries. `<client-only>` renders the bound `fallback` `TemplateRef` on the server (and on the client first paint, to match SSR HTML), then swaps in the projected children after mount. `<server-only>` is the symmetric inverse.

Imported from the `/ssr` subpath (ng-packagr secondary entry-point). The same `/ssr` entry also exposes `injectDeferred()` — see [packages/angular/CLAUDE.md](./CLAUDE.md) — for cross-adapter parity with `@real-router/{react,preact,solid,vue,svelte}/ssr`.

```typescript
import { Component } from "@angular/core";
import { ClientOnly, ServerOnly } from "@real-router/angular/ssr";

@Component({
  selector: "app-home",
  template: `
    <ng-template #loadingTpl>
      <span>Loading…</span>
    </ng-template>
    <client-only [fallback]="loadingTpl">
      <browser-api-widget />
    </client-only>

    <server-only>
      <seo-meta-strip />
    </server-only>
  `,
  imports: [ClientOnly, ServerOnly],
})
export class HomeComponent {}
```

Implementation: `signal(false)` + `afterNextRender(() => mounted.set(true))`. `afterNextRender` is a no-op on the server (Angular runtime guarantees), so SSR naturally lands on the SSR-side branch. End-to-end dogfooding lives in [`examples/web/angular/ssr-examples/ssr/`](../../examples/web/angular/ssr-examples/ssr/) (see `e2e/ssr-boundaries.spec.ts`).

### `<http-status-code>` (`@real-router/angular/ssr`)

Render-time HTTP status declaration. Writes `code` to the optional `HttpStatusSink` provided via `provideHttpStatusSink`, then renders nothing. Last write wins. No-op when no sink is provided.

```typescript
// not-found.component.ts
import { Component } from "@angular/core";
import { HttpStatusCode } from "@real-router/angular/ssr";

@Component({
  selector: "app-not-found",
  imports: [HttpStatusCode],
  template: `
    <http-status-code [code]="404" />
    <h1>Page not found</h1>
  `,
})
export class NotFoundComponent {}
```

```typescript
// entry-server.ts
import { bootstrapApplication } from "@angular/platform-browser";
import {
  createHttpStatusSink,
  provideHttpStatusSink,
} from "@real-router/angular/ssr";

const sink = createHttpStatusSink();

await bootstrapApplication(AppRoot, {
  providers: [
    provideRealRouterFactory({ baseRouter }),
    provideHttpStatusSink(sink),
  ],
});

response.status(sink.code ?? 200).send(html);
```

`HTTP_STATUS_SINK` is the underlying `InjectionToken` — inject it directly with `{ optional: true }` if you need to read the sink in your own components. `createHttpStatusSink()` constructs a fresh `{ code: number | undefined }` per request — read `sink.code` after the SSR render pass to set the response status. Loader-driven errors (`LoaderNotFound` → 404, `LoaderRedirect` → 30x) keep working as before; `<http-status-code>` covers render-time decisions only.

### `injectDeferred()` (`@real-router/angular/ssr`)

Reads `state.context.ssrDataDeferred[key]` (populated by `defer()` in `@real-router/ssr-data-plugin`). Returns `Signal<T | undefined>` — `undefined` before the promise settles, the resolved value once it does. Compose with `@if` or the `async` pipe for pending UI:

```typescript
import { Component } from "@angular/core";
import { injectDeferred } from "@real-router/angular/ssr";

@Component({
  template: `
    @if (reviews(); as r) {
      @for (review of r; track review.id) {
        <li>{{ review.author }}</li>
      }
    } @else {
      <p>Loading reviews…</p>
    }
  `,
})
export class ReviewsComponent {
  readonly reviews = injectDeferred<Review[]>("reviews");
}
```

**Full `/ssr` surface** (8 exports): `ClientOnly`, `ServerOnly`, `HttpStatusCode`, `injectDeferred`, `provideHttpStatusSink`, `HTTP_STATUS_SINK`, `createHttpStatusSink`, plus the `HttpStatusSink` type. See [`packages/angular/CLAUDE.md`](./CLAUDE.md#ssr-feature-surface--real-routerangularssr) for the implementation notes.

## Directives

### `realLink`

Navigation directive for `<a>` elements. Handles click events, sets `href`, and applies an active CSS class automatically.

```html
<a realLink routeName="users.profile" [routeParams]="{ id: '123' }">
  View Profile
</a>

<a
  realLink
  routeName="users.profile"
  [routeParams]="{ id: '123' }"
  activeClassName="is-active"
  [activeStrict]="false"
  [ignoreQueryParams]="true"
  [routeOptions]="{ replace: true }"
>
  View Profile
</a>
```

| Input               | Type                | Default     | Description                                                                                                     |
| ------------------- | ------------------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| `routeName`         | `string`            | `""`        | Target route name                                                                                               |
| `routeParams`       | `Params`            | `undefined` | Route parameters (omitted → `undefined`, shares one active-route source with `injectIsActiveRoute(name)`, #776) |
| `routeOptions`      | `NavigationOptions` | `{}`        | Navigation options (replace, etc.)                                                                              |
| `activeClassName`   | `string`            | `"active"`  | CSS class applied when route is active                                                                          |
| `activeStrict`      | `boolean`           | `false`     | Exact match only (no ancestor match)                                                                            |
| `ignoreQueryParams` | `boolean`           | `true`      | Query params don't affect active state                                                                          |
| `hash`              | `string`            | `undefined` | URL fragment (decoded). Tri-state: undefined preserves, `""` clears, value sets. (#532)                         |

#### `hash` input — URL fragment / tab-style UIs

```html
<a realLink [routeName]="'settings'" [hash]="'profile'">Profile</a>
<a realLink [routeName]="'settings'" [hash]="'account'">Account</a>
```

Active class is hash-aware — only the matching tab lights up. Live demo: [`examples/web/react/hash-examples/link-hash/`](../../examples/web/react/hash-examples/link-hash/) — behavior is identical across adapters, only template syntax differs. See the [Hash Fragment Support](https://github.com/greydragon888/real-router/wiki/Hash) wiki page for the full surface.

#### Object `routeParams` — content-stabilized

`RealLink` and `RealLinkActive` stabilize `routeParams` by **content** (`shallowEqual` — `Object.is` per key, key-order-insensitive), so an inline `[routeParams]="{ id: '123' }"` literal that Angular re-allocates on every change detection does **not** re-create the active-route source or re-run `buildHref` until the param content actually changes (#988). Binding a stable reference (a component field or signal) was already churn-free; this closes the gap for inline literals.

Caveat: nested object/array param **values** are compared by reference, not deep — stabilize them with a `signal`/`computed` if it matters:

```ts
// flat params — stable across change detection, recompute only on real change
@Component({ template: `<a realLink routeName="items.item" [routeParams]="{ id }" />` })
// nested value — fresh ref each CD → href/active recompute every CD; stabilize:
readonly params = computed(() => ({ filters: [1, 2] }));
// <a realLink routeName="search" [routeParams]="params()" />
```

### `[realLinkActive]`

Applies an active CSS class to any element when a route is active. Use this when you need active state on a non-`<a>` element, or when the clickable element and the styled element are different.

```html
<li [realLinkActive]="'active'" routeName="users">
  <a realLink routeName="users">Users</a>
</li>
```

| Input               | Type      | Default     | Description                                    |
| ------------------- | --------- | ----------- | ---------------------------------------------- |
| `realLinkActive`    | `string`  | `""`        | CSS class to apply when active                 |
| `routeName`         | `string`  | `""`        | Route to watch                                 |
| `routeParams`       | `Params`  | `undefined` | Route parameters (omitted → `undefined`, #776) |
| `activeStrict`      | `boolean` | `false`     | Exact match only                               |
| `ignoreQueryParams` | `boolean` | `true`      | Query params don't affect active state         |

### `routeMatch`

Structural directive used inside `<route-view>`. Marks an `ng-template` as the content to render when a route segment matches.

```html
<ng-template routeMatch="home">
  <app-home />
</ng-template>
```

### `routeSelf`

Structural directive used inside `<route-view>`. Marks an `ng-template` as the exact-match slot for the parent `<route-view>`'s `routeNode` — it renders only when `state.name === routeNode()`. Useful for nodes that have both an "index" view and child routes:

```html
<route-view [routeNode]="'users'">
  <ng-template routeSelf>
    <!-- shown when route is exactly "users" -->
    <app-users-list />
  </ng-template>
  <ng-template routeMatch="profile">
    <!-- shown when route is "users.profile" -->
    <app-user-profile />
  </ng-template>
</route-view>
```

**Template priority** inside `<route-view>`: `routeMatch` (segment prefix) → `routeSelf` (exact-match for `routeNode`) → `routeNotFound` (`UNKNOWN_ROUTE` only). First-wins for all three — `routeMatch`, `routeSelf`, and `routeNotFound` (#1439): the first matching template in declaration order wins, later duplicates are ignored.

### `routeNotFound`

Structural directive used inside `<route-view>`. Marks an `ng-template` as the fallback when no segment matches and the route is `UNKNOWN_ROUTE`.

```html
<ng-template routeNotFound>
  <app-not-found />
</ng-template>
```

## Accessibility

Add `<navigation-announcer>` once near the root of your application to enable WCAG-compliant screen reader announcements on every route change:

```typescript
import { NavigationAnnouncer } from "@real-router/angular";

@Component({
  selector: "app-root",
  imports: [NavigationAnnouncer],
  template: `
    <navigation-announcer />
    <!-- rest of your app -->
  `,
})
export class AppComponent {}
```

The announcer creates a visually hidden `aria-live` region and announces each navigation to screen readers. See the [Accessibility guide](https://github.com/greydragon888/real-router/wiki/Accessibility) for details.

`<navigation-announcer>` accepts optional `[prefix]` and `[getAnnouncementText]` signal inputs to customize the announced text:

| Input                   | Type                       | Description                                                                                         |
| ----------------------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| `[prefix]`              | `string`                   | Prefix prepended to the resolved text (default `"Navigated to "`)                                   |
| `[getAnnouncementText]` | `(route: State) => string` | Full custom text; overrides the default `h1 → title → route-name` chain (falls back on empty/throw) |

```typescript
@Component({
  imports: [NavigationAnnouncer],
  template: `<navigation-announcer [getAnnouncementText]="announce" />`,
})
export class AppComponent {
  announce = (route: State): string => `Now on ${route.name}`;
}
```

## Scroll Restoration

Opt-in via the `provideRealRouter` options bag:

```typescript
import { provideRealRouter } from "@real-router/angular";

bootstrapApplication(AppComponent, {
  providers: [
    provideRealRouter(router, {
      scrollRestoration: { mode: "restore" },
    }),
  ],
});
```

`RealRouterOptions` shape:

```typescript
interface RealRouterOptions {
  scrollRestoration?: ScrollRestorationOptions; // { mode?, anchorScrolling?, scrollContainer? }
  scrollSpy?: ScrollSpyOptions; // { selector, rootMargin?, scrollContainer? } — #575
  viewTransitions?: boolean;
}
```

Restores scroll on back/forward, scrolls to top (or `#hash`) on push. Three modes: `"restore"` (default), `"top"`, `"native"`. Custom containers via `scrollContainer: () => HTMLElement | null`. The utility is created by `provideEnvironmentInitializer` and torn down via `inject(DestroyRef)`. Options are a snapshot at bootstrap — not reactive to runtime changes. Under `@real-router/browser-plugin`, replace transitions now preserve scroll position and programmatic reloads restore from `sessionStorage` (portable via `state.transition.replace` / `state.transition.reload`). See [Scroll Restoration guide](https://github.com/greydragon888/real-router/wiki/Scroll-Restoration) for the full behaviour matrix.

## Scroll Spy

Opt into router-coordinated `IntersectionObserver`-driven URL hash spy via the same options bag:

```typescript
bootstrapApplication(AppComponent, {
  providers: [
    provideRealRouter(router, {
      scrollSpy: { selector: "[id]:is(h2,h3)" },
    }),
  ],
});
```

The URL hash tracks the topmost visible anchor as the user scrolls, syncing `state.context.url.hash` so sibling `<a realLink [hash]>` highlights stay current. Emits a forced same-route transition with `{ hash, replace: true, force: true, hashChange: true }` — same write API as `<a realLink [hash]>` (#532), `replace: true` so spy doesn't pollute history. Anti-flicker gates: `isTransitioning` (skip emits during transitions), `coolingDown` (skip emits during smooth `scrollIntoView` after a hash click; cleared on `scrollend` or 500 ms timeout), `selfEmitting` (spy doesn't rate-limit itself). Hardcoded internals: rAF + 150 ms trailing debounce, MutationObserver re-observe debounced 250 ms.

Options: `{ selector: string, rootMargin?: string, scrollContainer?: () => HTMLElement | null }`. Default `rootMargin`: `"-20% 0px -60% 0px"`. Empty `selector` / `undefined` = off. SSR / browsers without `IntersectionObserver` = NOOP. Requires `browser-plugin` or `navigation-plugin` (hash-plugin / memory-plugin → warn-once + NOOP). The utility is installed via `provideEnvironmentInitializer` (`installScrollSpy`) and torn down on `DestroyRef`; options are a snapshot at bootstrap, not reactive.

Available on both `provideRealRouter(router, { scrollSpy })` (SPA) and `provideRealRouterFactory({ baseRouter, scrollSpy })` (SSR). On the SSR path the utility is correctly NOOP'd on the server pass (`document` is undefined). Behaviour is identical to the React adapter — see the [React Scroll Spy demo](../../examples/web/react/hash-examples/scroll-spy/) (12 sections, TOC sidebar, 10 e2e scenarios) and the [Scroll Spy guide](https://github.com/greydragon888/real-router/wiki/Scroll-Spy).

## Server-Side Rendering

For Angular SSR (`@angular/ssr` with `outputMode: "server"`) and SSG build-time render via `renderApplication`, use `provideRealRouterFactory` instead of `provideRealRouter`. The factory creates a per-request router clone via Angular's `REQUEST: InjectionToken<Request | null>`, runs `router.start(url)` through `provideAppInitializer`, and disposes the router on `DestroyRef`:

```typescript
import { provideRealRouterFactory } from "@real-router/angular";
import { browserPluginFactory } from "@real-router/browser-plugin";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";

const baseRouter = createRouter(routes);

export const appConfig: ApplicationConfig = {
  providers: [
    provideRealRouterFactory({
      baseRouter,
      plugins: (request) =>
        request
          ? [ssrDataPluginFactory(loaders)]
          : [browserPluginFactory(), ssrDataPluginFactory(loaders)],
      deps: (request) => ({
        currentUser: request
          ? parseCookies(request.headers.get("cookie"))
          : parseCookies(document.cookie),
      }),
    }),
  ],
};
```

Existing `provideRealRouter(router)` is unchanged — keep using it for SPA / post-hydrate scenarios. Both APIs ship in parallel; pick one for the whole application.

### Working examples

**SPA examples** — `provideRealRouter(router)` after `await router.start()`:

| Example                                                                                     | Demonstrates                                                                          |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`examples/web/angular/basic/`](../../examples/web/angular/basic)                           | Minimal setup with `RouteView` + `RealLink` + `injectRoute`                           |
| [`examples/web/angular/combined/`](../../examples/web/angular/combined)                     | All features combined: nested routes, dynamic params, lazy loading, persistent params |
| [`examples/web/angular/dynamic-routes/`](../../examples/web/angular/dynamic-routes)         | `:id` params, programmatic navigation                                                 |
| [`examples/web/angular/hash-routing/`](../../examples/web/angular/hash-routing)             | `hash-plugin` with `<a realLink hash="…">` tab-style UIs (#532)                       |
| [`examples/web/angular/lazy-loading/`](../../examples/web/angular/lazy-loading)             | Route-level code-splitting via `import()`                                             |
| [`examples/web/angular/nested-routes/`](../../examples/web/angular/nested-routes)           | Multi-level `<route-view>` composition                                                |
| [`examples/web/angular/persistent-params/`](../../examples/web/angular/persistent-params)   | `persistent-params-plugin` integration                                                |
| [`examples/web/angular/animation-examples/`](../../examples/web/angular/animation-examples) | View Transitions API + scroll restoration + direction-tracker patterns                |

**SSR / SSG examples** — `provideRealRouterFactory({ baseRouter, plugins, deps })`:

| Example                                                                                                     | Demonstrates                                                                                   |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`examples/web/angular/ssr-examples/ssr/`](../../examples/web/angular/ssr-examples/ssr)                     | Classical SSR with cookie-based DI, auth guards, nested loaders                                |
| [`examples/web/angular/ssr-examples/ssr-mixed/`](../../examples/web/angular/ssr-examples/ssr-mixed)         | Mixed SSR/CSR routes — some routes server-rendered, others CSR-only                            |
| [`examples/web/angular/ssr-examples/ssr-streaming/`](../../examples/web/angular/ssr-examples/ssr-streaming) | Streaming SSR with `@defer (on viewport)` + `@defer (on hover)` + `withIncrementalHydration()` |
| [`examples/web/angular/ssr-examples/ssg/`](../../examples/web/angular/ssr-examples/ssg)                     | Static site generation via in-process AngularNodeAppEngine + `getStaticPaths()`                |

**Post-hydration loader skip (#599)** — `provideRealRouterFactory` automatically bridges Angular's `TransferState` to the cross-adapter hydration scratchpad. On the server pass, the resolved router state is written to `TransferState`; on the client, the bootstrap consumes the seed via `hydrateRouter(...)` and `ssr-data-plugin` reuses the server-resolved `state.context.data` without re-invoking the loader on first paint. Requires `provideServerRendering()` (server) + `provideClientHydration()` (client) — both standard for Angular SSR apps. Verified end-to-end in `ssr/` and `ssr-streaming/` examples via `window.__LOADER_CALLS__` counter assertion.

See [CLAUDE.md → SSR Support](./CLAUDE.md#ssr-support) for the full decision matrix, lifecycle diagram, plugin separation guidance, decision matrix, and known constraints.

## View Transitions

Opt-in animated route transitions via the browser's [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API):

```typescript
import { provideRealRouter } from "@real-router/angular";

bootstrapApplication(AppComponent, {
  providers: [provideRealRouter(router, { viewTransitions: true })],
});
```

No-op on unsupported browsers (Firefox as of 2026-04, SSR). Utility is created by `provideEnvironmentInitializer` at bootstrap and torn down via `inject(DestroyRef)`. Option is a snapshot at bootstrap — not reactive to runtime changes. Customization is pure CSS via `::view-transition-*` pseudo-elements and `view-transition-name` for hero morphs. See [View Transitions guide](https://github.com/greydragon888/real-router/wiki/View-Transitions) for patterns.

## Angular-Specific Patterns

### Signals, Not Observables

`injectRoute()` and `injectRouteNode()` return Angular signals, not RxJS observables. Read them in templates directly or call them in computed/effect:

```typescript
@Component({
  template: `
    @if (route.routeState().route; as r) {
      <h1>{{ r.name }}</h1>
    }
  `,
})
export class PageComponent {
  readonly route = injectRoute();
}
```

To react to changes in class code, use `effect`:

```typescript
import { effect } from "@angular/core";

export class PageComponent {
  readonly route = injectRouteNode("users");

  constructor() {
    effect(() => {
      const r = this.route.routeState().route;
      if (r) {
        document.title = `Users — ${r.params["id"] ?? "list"}`;
      }
    });
  }
}
```

### Injection Context

All `inject*` functions must be called within an injection context. The constructor and field initializers are both valid:

```typescript
// Field initializer — preferred
export class MyComponent {
  readonly route = injectRoute(); // valid
}

// Constructor — also valid
export class MyComponent {
  readonly route: RouteSignals;

  constructor() {
    this.route = injectRoute(); // valid
  }
}

// Outside injection context — throws
export class MyComponent {
  ngOnInit() {
    const route = injectRoute(); // ERROR: not in injection context
  }
}
```

`sourceToSignal` follows the same rule — it calls `inject(DestroyRef)` internally.

### DestroyRef for Cleanup

Subscriptions created by `sourceToSignal` and the directives clean up automatically via `DestroyRef.onDestroy`. No manual unsubscribe needed.

### Zoneless Compatibility

The adapter is signal-first and does not depend on Zone.js. It works with `provideExperimentalZonelessChangeDetection()` out of the box.

### Reactive Source Setup via `effect()` (#630)

`RealLink`, `RealLinkActive`, and `RouteView` create their subscription sources inside `effect(...)` blocks scheduled from the **constructor** (not `ngOnInit`). Reading signal inputs inside `effect()` makes the source-creation REACTIVE — when `[realLink]`, `[routeParams]`, `[hash]`, `[realLinkActive]`, or `[routeNode]` change in AOT, the effect tears down the previous source via `onCleanup` and creates a new one with the current input values. The legacy `ngOnInit` setup captured inputs once at mount and produced a real AOT bug (#630). Effect cleanup is bound automatically to the host directive's injection-context `DestroyRef`.

In `RealLink` / `RealLinkActive`, `[routeParams]` is routed through `shallowEqual` content-stabilization before the effect reads it, so an inline-literal binding re-allocated on every change detection only re-creates the source on real content change (see [Object `routeParams`](#object-routeparams--content-stabilized), #988).

## Signal Bridge

### `sourceToSignal(source)`

Bridges any `RouterSource<T>` (from `@real-router/sources`) into an Angular `Signal<T>`. Cleanup wires through `inject(DestroyRef)` — must be called in an injection context. Used internally by `RouterErrorBoundary`; exposed for custom composables that need to bridge router sources into reactive signals.

```typescript
import { sourceToSignal } from "@real-router/angular";
import { createTransitionSource } from "@real-router/sources";

const transitionSignal = sourceToSignal(createTransitionSource(router));
```

## Documentation

Full documentation: [Wiki](https://github.com/greydragon888/real-router/wiki) — start with the [Angular Integration guide](https://github.com/greydragon888/real-router/wiki/Angular-Integration) for Angular-specific examples and gotchas.

The shared (cross-framework) wiki pages use the `use*` naming convention — they cover every adapter (React, Preact, Solid, Vue, Svelte, Angular) and each page has an explicit Angular section showing the `inject*` form:

- [RouterProvider](https://github.com/greydragon888/real-router/wiki/RouterProvider) · [RouteView](https://github.com/greydragon888/real-router/wiki/RouteView) · [RouterErrorBoundary](https://github.com/greydragon888/real-router/wiki/RouterErrorBoundary) · [Scroll Restoration](https://github.com/greydragon888/real-router/wiki/Scroll-Restoration) · [Scroll Spy](https://github.com/greydragon888/real-router/wiki/Scroll-Spy)
- [useRouter → `injectRouter`](https://github.com/greydragon888/real-router/wiki/useRouter) · [useRoute → `injectRoute`](https://github.com/greydragon888/real-router/wiki/useRoute) · [useRouteNode → `injectRouteNode`](https://github.com/greydragon888/real-router/wiki/useRouteNode) · [useNavigator → `injectNavigator`](https://github.com/greydragon888/real-router/wiki/useNavigator) · [useRouteUtils → `injectRouteUtils`](https://github.com/greydragon888/real-router/wiki/useRouteUtils) · [useRouterTransition → `injectRouterTransition`](https://github.com/greydragon888/real-router/wiki/useRouterTransition) · [useRouteExit → `injectRouteExit`](https://github.com/greydragon888/real-router/wiki/useRouteExit) · [useRouteEnter → `injectRouteEnter`](https://github.com/greydragon888/real-router/wiki/useRouteEnter)

## Related Packages

| Package                                                                                  | Description                             |
| ---------------------------------------------------------------------------------------- | --------------------------------------- |
| [@real-router/core](https://www.npmjs.com/package/@real-router/core)                     | Core router (required dependency)       |
| [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) | Browser History API integration         |
| [@real-router/sources](https://www.npmjs.com/package/@real-router/sources)               | Subscription layer (used internally)    |
| [@real-router/route-utils](https://www.npmjs.com/package/@real-router/route-utils)       | Route tree queries (`injectRouteUtils`) |

## Contributing

See [contributing guidelines](../../CONTRIBUTING.md) for development setup and PR process.

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
