# @real-router/lifecycle-plugin

[![npm](https://img.shields.io/npm/v/@real-router/lifecycle-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/lifecycle-plugin)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/lifecycle-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/lifecycle-plugin)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/lifecycle-plugin&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/lifecycle-plugin&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Route-level lifecycle hooks for [Real-Router](https://github.com/greydragon888/real-router). Add `onNavigate`, `onEnter`, `onStay`, `onLeave` callbacks directly to route definitions.

```typescript
// Without plugin — scattered subscribe() calls with route checks:
router.subscribe(({ route, previousRoute }) => {
  if (route.name === "catalog") loadServices(route.params);
  if (previousRoute?.name === "editor") saveEditorState();
});

// With plugin — declarative, per-route:
{ name: "catalog", path: "/catalog?q&sort", onNavigate: () => (s) => loadServices(s.params) }
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

const routes = [
  {
    name: "services.catalog",
    path: "/catalog?q&sort&dir",
    // Fires on entry AND on param-change — recommended default
    onNavigate: () => (toState) => {
      loadServices(toState.params);
    },
  },
  {
    name: "chat",
    path: "/chat/:roomId",
    // Entry-specific behavior overrides onNavigate for entry;
    // param changes fall back to onNavigate.
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

await router.start("/");
```

> **Start with `onNavigate`.** It covers the most common case — running the same logic whenever the route is the navigation target (data loading, analytics, UI reset). Use `onEnter` or `onStay` only when entry and param-change require different behavior.

## Hook Reference

| Hook         | Fires when                            | Typical use case                            |
| ------------ | ------------------------------------- | ------------------------------------------- |
| `onNavigate` | Route is entered OR params changed    | Data loading, analytics, UI reset (default) |
| `onEnter`    | Route is entered                      | Entry-only setup (open socket, scroll top)  |
| `onStay`     | Same route, params changed            | Stay-only logic (incremental updates)       |
| `onLeave`    | Route is left                         | Cleanup timers, save state                  |

**Priority:** `onEnter` / `onStay` take precedence over `onNavigate` for their case. `onNavigate` acts as a fallback — it fires only when the case-specific hook is not defined. You can mix them: share common logic in `onNavigate`, override per case with `onEnter` / `onStay`.

Each hook field is a **factory function** `(router, getDependency) => (toState, fromState?) => void`. The factory runs once per route; the returned callback is cached and invoked on each matching transition. When you don't need DI, omit the factory params:

```typescript
// Without DI — ignore factory params:
onEnter: () => (toState) => { console.log("entered", toState.name); }

// With DI — access router and dependencies:
onEnter: (router, getDependency) => (toState) => {
  const analytics = getDependency("analytics");
  analytics.track("page_viewed", { route: toState.name });
}
```

### Execution order

`onLeave` fires first (at leave-approve phase), then `onEnter` or `onStay` (at transition success).

## Use Cases

### Data loading (onNavigate — recommended default)

```typescript
{
  name: "services.catalog",
  path: "/catalog?q&sort&dir",
  onNavigate: () => (toState) => {
    // Fires on entry from another route AND on filter/sort param changes
    loadServices(toState.params);
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

### React to param changes

```typescript
{
  name: "search",
  path: "/search?q",
  onStay: () => (toState) => {
    searchStore.setQuery(toState.params.q);
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
