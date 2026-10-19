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

// With plugin — declarative, per-route; the signal cancels a superseded load:
{ name: "catalog", path: "/catalog?q&sort", onNavigate: () => (s, _from, signal) => loadServices(s.search, { signal }) }
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
    // Fires on entry AND on param-change — recommended default. The signal
    // aborts this load when the next navigation commits.
    onNavigate: () => (toState, _fromState, signal) => {
      loadServices(toState.search, { signal });
    },
  },
  {
    name: "chat",
    path: "/chat/:roomId",
    // Orthogonal: onEnter covers the visit, onNavigate covers every
    // navigation (including entry). Both fire on entry.
    // onEnter's signal aborts when the user leaves the chat — switching
    // rooms keeps the shortcuts.
    onEnter: () => (_toState, _fromState, signal) => {
      window.addEventListener("keydown", onChatShortcut, { signal });
    },
    // onNavigate runs for every room, and its signal closes the previous
    // room's connection when the next navigation commits.
    onNavigate: () => (toState, _fromState, signal) => {
      chatSocket.connect(toState.params.roomId, { signal });
      loadMessages(toState.params.roomId, { signal });
    },
  },
];

const router = createRouter(routes);
router.usePlugin(lifecyclePluginFactory());

await router.start("/catalog");
```

> **Start with `onNavigate`.** It covers the most common case — running the same logic whenever the route is the navigation target (data loading, analytics, UI reset). Add `onEnter` or `onStay` for extra case-specific logic.

## Hook Reference

| Hook         | Fires when                                | Its `signal` aborts when    | Typical use case                                               |
| ------------ | ----------------------------------------- | --------------------------- | -------------------------------------------------------------- |
| `onNavigate` | Any successful navigation to the route    | the next navigation commits | Data loading, analytics, UI reset (default)                    |
| `onEnter`    | Route is entered                          | the route is left           | Work for the whole visit (shortcuts, polling, scroll top)      |
| `onStay`     | Same route name (params may be unchanged) | the next navigation commits | Stay-only logic (incremental updates)                          |
| `onLeave`    | A navigation away from the route commits  | the next navigation commits | Cleanup, save state, work that starts after leaving            |

**Orthogonal dispatch:** `onEnter` / `onStay` / `onNavigate` fire independently based on their own conditions. On entry, `onEnter` **and** `onNavigate` fire. On param-change, `onStay` **and** `onNavigate` fire. Each hook is composable — declaring one never silences another.

Each hook field is a **factory function** `(router, getDependency) => (toState, fromState, signal) => void`. The factory runs once per route; the returned callback is cached and invoked on each matching transition. When you don't need DI, omit the factory params:

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

When `onLeave` runs, the router already holds the new state: `router.getState()` returns the target, and the route being left is the hook's `fromState`. A `router.subscribe` listener or a plugin registered before this one sees the commit first. On a navigation the router starts, a URL plugin registered after this one has not written the history entry yet when the hooks run, so register it first when a hook reads `location` or `state.context.url`. Work that has to happen before the commit, or be undone when the navigation does not commit, belongs in `router.subscribeLeave`: its listeners, awaited ones included, run before `onLeave`, and their `signal` aborts when the navigation does not commit.

### Cancelling work with `signal`

The third argument is an `AbortSignal` that aborts when the work the hook started is no longer wanted:

- `onNavigate`, `onStay` and `onLeave` — when the next navigation commits. Each answers one navigation, and the next one supersedes it.
- `onEnter` — when the route is left. It answers the visit, so a param or search change on the same route keeps its signal alive.
- All four — on `router.stop()`, on `router.dispose()`, and when the plugin is removed.

A navigation that does not commit — refused by a guard, cancelled, failed, or to the current state — aborts none of them: the user stays on the route. A navigation that commits aborts the previous signals before any of its hooks runs, so a superseded load is already cancelled when the next one starts. A `replace()` that drops the active route commits too, so the route's signals abort even though its `onLeave` no longer runs.

The reason is a fresh `DOMException` named `AbortError` — the value `fetch` rejects with — so `if (error.name === "AbortError") return;` keeps a cancelled load out of your error handling.

#### Which hook for which work

| Work                                                                       | ✅ Do                                                                                                      | ❌ Don't                                                                                                                                                                    |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Load data that depends on params or search                                 | `onNavigate` with its `signal`: it runs for every value, and the next navigation cancels the previous load | `onEnter`: it does not run when params change, so the data goes stale. Splitting the load between `onEnter` and `onStay`: see the example below                            |
| Work for the whole visit: shortcuts, a polled badge, a page subscription | `onEnter` with its `signal`: it survives param and search changes and aborts on leave, `stop()`, `dispose()` | `onNavigate`: it restarts the work on every filter change                                                                                                                    |
| A resource per param value: a socket per `:roomId`                         | `onNavigate` with its `signal`: switching rooms closes the previous room's socket                         | `onEnter`: switching rooms is a navigation to the same route, so `onEnter` does not run and the old room stays connected                                                    |
| Work that starts after leaving: an animation of shared chrome              | `onLeave` with its `signal`: it aborts if the user navigates on before it ends                            | —                                                                                                                                                                           |
| The exit animation of the page being left                                  | `router.subscribeLeave` / `useRouteExit`: they run before the commit and can hold it until the animation ends | `onLeave`: it runs after the commit, while the next page renders, and cannot hold anything                                                                              |
| A save that must finish                                                    | `onLeave`, without the signal                                                                             | Passing `onLeave`'s `signal` to it: the next navigation aborts the save                                                                                                    |

❌ A load split between `onEnter` and `onStay` races: the first load's signal lives until the route is left, so a slow first response can land after the first `onStay` load.

```typescript
{
  name: "search",
  path: "/search?q",
  onEnter: () => (toState, _fromState, signal) => {
    showSkeleton();
    loadResults(toState.search.q, { signal });
  },
  onStay: () => (toState, _fromState, signal) => {
    showSpinner();
    loadResults(toState.search.q, { signal });
  },
}
```

✅ Load once, in `onNavigate`; keep only the difference in UI in `onEnter` / `onStay`.

```typescript
{
  name: "search",
  path: "/search?q",
  onEnter: () => () => {
    showSkeleton();
  },
  onStay: () => () => {
    showSpinner();
  },
  onNavigate: () => (toState, _fromState, signal) => {
    loadResults(toState.search.q, { signal });
  },
}
```

### Redirect from a hook

Redirecting with a **synchronous** `router.navigate()` inside a hook throws `REENTRANT_NAVIGATION` (a reentrant navigate from a transition listener is banned) and, via the #798 isolation, surfaces as an uncaught error — the redirect never happens. Defer it: `queueMicrotask(() => router.navigate("login"))` runs after the transition settles and works.

## Use Cases

### Data loading (onNavigate — recommended default)

```typescript
{
  name: "catalog",
  path: "/catalog?q&sort&dir",
  onNavigate: () => (toState, _fromState, signal) => {
    // Fires on entry from another route AND on filter/sort param changes;
    // the next navigation aborts this request before its own load starts
    loadServices(toState.search, { signal });
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

### Cleanup

Work opened on entry closes itself through `onEnter`'s `signal` — when the route is left, and on `stop()` / `dispose()`, where `onLeave` does not run. `onLeave` stays for what happens once, on the way out:

```typescript
{
  name: "editor",
  path: "/editor/:docId",
  onEnter: () => (_toState, _fromState, signal) => {
    const timer = setInterval(autosave, 5000);

    signal.addEventListener("abort", () => {
      clearInterval(timer);
    });
  },
  onLeave: () => () => {
    saveEditorState();
  },
}
```

> **Caveat:** `onLeave` runs on every commit that leaves the route, a `navigateToNotFound()` commit included. It does **not** run for a route whose definition is gone when the commit reaches the plugin: a `getRoutesApi(router).replace()` that drops the active route, or a `remove()` from a commit listener registered before the plugin, takes the hook with it, and `clear()` commits nothing — so cleanup in `onLeave` is not guaranteed across tree mutations (#1201). `onEnter`'s signal is: the commit that leaves the route aborts it whatever became of the route's definition, and `clear()` needs a stopped router, whose `stop()` already aborted it.

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

### Work for the whole visit

```typescript
{
  name: "inbox",
  path: "/inbox?folder&page",
  // A badge polled for the whole visit: changing folder or page keeps it
  // ticking, leaving the inbox stops it.
  onEnter: () => (_toState, _fromState, signal) => {
    const timer = setInterval(refreshUnreadCount, 30_000);

    signal.addEventListener("abort", () => {
      clearInterval(timer);
    });
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
