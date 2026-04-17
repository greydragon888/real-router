# @real-router/angular

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Angular 21 integration for [Real-Router](https://github.com/greydragon888/real-router) — inject functions, components, and directives.

## Installation

```bash
npm install @real-router/angular @real-router/core @real-router/browser-plugin
```

**Peer dependencies:** `@angular/core` >= 21.0.0, `@angular/common` >= 21.0.0

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

| Function                                    | Returns                            | Reactive?                            |
| ------------------------------------------- | ---------------------------------- | ------------------------------------ |
| `injectRouter()`                            | `Router`                           | Never                                |
| `injectNavigator()`                         | `Navigator`                        | Never                                |
| `injectRoute()`                             | `RouteSignals`                     | `routeState` on every navigation     |
| `injectRouteNode(name)`                     | `RouteSignals`                     | When the node subtree is entered, left, or changes between descendants (uses `shouldUpdateNode` — sibling-leaf transitions within the same subtree still fire) |
| `injectRouteUtils()`                        | `RouteUtils`                       | Never                                |
| `injectRouterTransition()`                  | `Signal<RouterTransitionSnapshot>` | On transition start/end              |
| `injectIsActiveRoute(name, params?, opts?)` | `Signal<boolean>`                  | On active state change               |

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
```

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

| Input               | Type                | Default    | Description                            |
| ------------------- | ------------------- | ---------- | -------------------------------------- |
| `routeName`         | `string`            | `""`       | Target route name                      |
| `routeParams`       | `Params`            | `{}`       | Route parameters                       |
| `routeOptions`      | `NavigationOptions` | `{}`       | Navigation options (replace, etc.)     |
| `activeClassName`   | `string`            | `"active"` | CSS class applied when route is active |
| `activeStrict`      | `boolean`           | `false`    | Exact match only (no ancestor match)   |
| `ignoreQueryParams` | `boolean`           | `true`     | Query params don't affect active state |

### `[realLinkActive]`

Applies an active CSS class to any element when a route is active. Use this when you need active state on a non-`<a>` element, or when the clickable element and the styled element are different.

```html
<li [realLinkActive]="'active'" routeName="users" [routeParams]="{}">
  <a realLink routeName="users">Users</a>
</li>
```

| Input               | Type      | Default | Description                            |
| ------------------- | --------- | ------- | -------------------------------------- |
| `realLinkActive`    | `string`  | `""`    | CSS class to apply when active         |
| `routeName`         | `string`  | `""`    | Route to watch                         |
| `routeParams`       | `Params`  | `{}`    | Route parameters                       |
| `activeStrict`      | `boolean` | `false` | Exact match only                       |
| `ignoreQueryParams` | `boolean` | `true`  | Query params don't affect active state |

### `routeMatch`

Structural directive used inside `<route-view>`. Marks an `ng-template` as the content to render when a route segment matches.

```html
<ng-template routeMatch="home">
  <app-home />
</ng-template>
```

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

### ngOnInit for Input-Dependent Setup

`RealLink`, `RealLinkActive`, and `RouteView` create their subscription sources in `ngOnInit`, not the constructor. Signal inputs (`input()`) are not available during construction, so setup that reads inputs must be deferred to `ngOnInit`.

## Signal Bridge

### `sourceToSignal(source)`

Bridges any `RouterSource<T>` (from `@real-router/sources`) into an Angular `Signal<T>`. Cleanup wires through `inject(DestroyRef)` — must be called in an injection context. Used internally by `RouterErrorBoundary`; exposed for custom composables that need to bridge router sources into reactive signals.

```typescript
import { sourceToSignal } from "@real-router/angular";
import { createTransitionSource } from "@real-router/sources";

const transitionSignal = sourceToSignal(createTransitionSource(router));
```

## Documentation

Full documentation: [Wiki](https://github.com/greydragon888/real-router/wiki)

- [RouterProvider](https://github.com/greydragon888/real-router/wiki/RouterProvider) · [RouteView](https://github.com/greydragon888/real-router/wiki/RouteView) · [RouterErrorBoundary](https://github.com/greydragon888/real-router/wiki/RouterErrorBoundary)
- [injectRouter](https://github.com/greydragon888/real-router/wiki/injectRouter) · [injectRoute](https://github.com/greydragon888/real-router/wiki/injectRoute) · [injectRouteNode](https://github.com/greydragon888/real-router/wiki/injectRouteNode) · [injectNavigator](https://github.com/greydragon888/real-router/wiki/injectNavigator) · [injectRouteUtils](https://github.com/greydragon888/real-router/wiki/injectRouteUtils) · [injectRouterTransition](https://github.com/greydragon888/real-router/wiki/injectRouterTransition)

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
