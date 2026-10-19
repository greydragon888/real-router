# @real-router/lifecycle-plugin

[![npm](https://img.shields.io/npm/v/@real-router/lifecycle-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/lifecycle-plugin)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/lifecycle-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/lifecycle-plugin)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/lifecycle-plugin&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/lifecycle-plugin&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Route-level lifecycle hooks for [Real-Router](https://github.com/greydragon888/real-router). Add `onNavigate`, `onEnter`, `onStay`, `onLeave` callbacks directly to route definitions.

<!-- doc-code: skip — before and after: subscribe() calls, then route definitions -->
```typescript
// Without plugin — scattered subscribe() calls with route checks:
router.subscribe(({ route, previousRoute }) => {
  if (route.name === "catalog") loadServices(route.search);
  if (previousRoute?.name === "editor") saveEditorState();
});

// With plugin — declarative, per-route:
{ name: "catalog", path: "/catalog?q&sort", onNavigate: () => (s) => loadServices(s.search) }
{ name: "editor", path: "/editor", onLeave: () => () => saveEditorState() }
```

## Installation

```bash
npm install @real-router/lifecycle-plugin
```

**Peer dependency:** `@real-router/core`

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { lifecyclePluginFactory } from "@real-router/lifecycle-plugin";
import type { Route } from "@real-router/core";

const routes: Route[] = [
  {
    name: "catalog",
    path: "/catalog?q&sort&dir",
    // Fires on entry AND on param-change — recommended default
    onNavigate: () => (toState) => {
      loadServices(toState.search);
    },
  },
  {
    name: "chat",
    path: "/chat/:roomId",
    // Orthogonal: onEnter covers entry-only setup, onNavigate covers
    // every navigation (including entry). Both fire on entry.
    onEnter: () => (toState) => {
      chatSocket.connect(toState.params.roomId);
    },
    onNavigate: () => (toState) => {
      loadMessages(toState.params.roomId);
    },
    onLeave: () => () => {
      chatSocket.disconnect();
    },
  },
];

const router = createRouter(routes);
router.usePlugin(lifecyclePluginFactory());

await router.start("/catalog");
```

> **Start with `onNavigate`.** It covers the most common case — running the same logic whenever the route is the navigation target (data loading, analytics, UI reset). Add `onEnter` or `onStay` for extra case-specific logic.

## Hook Reference

| Hook         | Fires when                              | Typical use case                            |
| ------------ | --------------------------------------- | ------------------------------------------- |
| `onNavigate` | Any successful navigation to the route  | Data loading, analytics, UI reset (default) |
| `onEnter`    | Route is entered                        | Entry-only setup (open socket, scroll top)  |
| `onStay`     | Same route name (params may be unchanged)  | Stay-only logic (incremental updates)       |
| `onLeave`    | A navigation away from the route commits | Cleanup timers, save state                 |

**Orthogonal dispatch:** `onEnter` / `onStay` / `onNavigate` fire independently based on their own conditions. On entry, `onEnter` **and** `onNavigate` fire. On param-change, `onStay` **and** `onNavigate` fire. Each hook is composable — declaring one never silences another.

Each hook field is a **factory function** `(router, getDependency) => (toState, fromState?) => void`. The factory runs once per route; the returned callback is cached and invoked on each matching transition. When you don't need DI, omit the factory params:

<!-- doc-code: skip — two variants of one route option, outside their route -->
```typescript
// Without DI — ignore factory params:
onEnter: () => (toState) => { console.log("entered", toState.name); }

// With DI — access router and dependencies. getDependency is typed by the
// routes' dependency map (`const routes: Route<{ analytics: Analytics }>[]`)
// and reads what `createRouter(routes, {}, { analytics })` registered:
onEnter: (router, getDependency) => (toState) => {
  const analytics = getDependency("analytics");
  analytics.track("page_viewed", { route: toState.name });
}
```

### Execution order

Every hook runs when the navigation commits. On a navigation to another route, `onLeave` of the route being left runs first, then `onEnter` of the target; on the same route, `onStay` runs instead of both. `onNavigate` runs last.

A navigation that does not commit — refused by a guard, cancelled, or failed — runs none of them, so a route the user stays on is never cleaned up.

When `onLeave` runs, the router already holds the new state: `router.getState()` returns the target, and the route being left is the hook's `fromState`. A `router.subscribe` listener or a plugin registered before this one sees the commit first. Work that has to happen before the commit, or be undone when the navigation does not commit, belongs in `router.subscribeLeave`: its listeners, awaited ones included, run before `onLeave`, and their `signal` aborts when the navigation does not commit.

### Redirect from a hook

Redirecting with a **synchronous** `router.navigate()` inside a hook throws `REENTRANT_NAVIGATION` (a reentrant navigate from a transition listener is banned) and, via the #798 isolation, surfaces as an uncaught error — the redirect never happens. Defer it: `queueMicrotask(() => router.navigate("login"))` runs after the transition settles and works.

## Use Cases

### Data loading (onNavigate — recommended default)

```typescript
{
  name: "catalog",
  path: "/catalog?q&sort&dir",
  onNavigate: () => (toState) => {
    // Fires on entry from another route AND on filter/sort param changes
    loadServices(toState.search);
  },
}
```

### Analytics tracking

```typescript
{
  name: "product",
  path: "/products/:id",
  onEnter: () => (toState) => {
    analytics.track("product_viewed", { productId: toState.params.id });
  },
}
```

### Cleanup on leave

```typescript
{
  name: "editor",
  path: "/editor/:docId",
  onLeave: () => () => {
    autosaveTimer.clear();
    webSocket.disconnect();
  },
}
```

> **Caveat:** `onLeave` runs on every commit that leaves the route, a `navigateToNotFound()` commit included. It does **not** run for a route whose definition is gone when the commit reaches the plugin: a `getRoutesApi(router).replace()` that drops the active route, or a `remove()` from a commit listener registered before the plugin, takes the hook with it, and `clear()` commits nothing — so cleanup here is not guaranteed across tree mutations (#1201).

### React to param changes

```typescript
{
  name: "search",
  path: "/search?q",
  onStay: () => (toState) => {
    searchStore.setQuery(toState.search.q);
  },
}
```

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — Design decisions and data flow
- [Plugin Architecture](https://github.com/greydragon888/real-router/wiki/plugin-architecture) — How plugins integrate with the router

## Related Packages

| Package                                                                                  | Description                            |
| ---------------------------------------------------------------------------------------- | -------------------------------------- |
| [@real-router/core](https://www.npmjs.com/package/@real-router/core)                     | Core router (required peer dependency) |
| [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) | Browser History API integration        |
| [@real-router/logger-plugin](https://www.npmjs.com/package/@real-router/logger-plugin)   | Development logging                    |

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
