# @real-router/react

[![npm](https://img.shields.io/npm/v/@real-router/react.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/react)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/react.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/react)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/react&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/react&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> React integration for [Real-Router](https://github.com/greydragon888/real-router) — hooks, components, and context providers.

## Installation

```bash
npm install @real-router/react @real-router/core @real-router/browser-plugin
```

**Peer dependency:** main entry requires `react` >= 19.2.0 (uses `<Activity>`); `@real-router/react/legacy` works with `react` >= 18.0.0; `@real-router/react/ink` requires `react` >= 19.2 **and** `ink` >= 7.0.0 (Ink v7 itself pins React 19.2+).

## Entry Points

| Import Path                                     | React Version | Runtime           | Includes                                                                                                                                    |
| ----------------------------------------------- | ------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `@real-router/react`                            | 19.2+         | DOM               | Full client API (hooks, `Link`, `RouteView` with `keepAlive`, `RouterErrorBoundary`). **No SSR-feature components** — those live at `/ssr`. |
| `@real-router/react/ssr`                        | 19.2+         | DOM (SSR-aware)   | `<ClientOnly>`, `<ServerOnly>`, `<Await>`, `<Streamed>`, `useDeferred`, `<HttpStatusCode>`, `<HttpStatusProvider>`, `createHttpStatusSink`  |
| `@real-router/react/legacy`                     | 18+           | DOM               | Client API for React 18 (no `RouteView`, no SSR helpers)                                                                                    |
| `@real-router/react/legacy/ssr`                 | 18+           | DOM (SSR-aware)   | SSR-feature subset for React 18 — same as `/ssr` minus `<Await>` (which depends on React 19's `use(promise)`)                               |
| `@real-router/react/ink`                        | 19.2+         | Terminal (Ink 7+) | Hooks, `InkRouterProvider`, `InkLink` — no `Link`, no `RouteView`, no `announceNavigation`                                                  |
| `@real-router/react` (`react-server` condition) | 19+           | RSC bundler       | **Type-only** re-exports for Server Components — no client runtime. Same condition applies to `/ssr` for prop types.                        |

All client entries share the same underlying hook code. `/legacy` excludes React 19.2 `<Activity>`; `/ink` excludes DOM-bound primitives (`<a>`-based `Link`, `announceNavigation`) and replaces them with keyboard-driven terminal equivalents. The `/ssr` split keeps server-only prop types out of the client TypeScript context for apps that don't touch SSR (bundle cost is ≈ 0 thanks to `"sideEffects": false`).

The root export resolves to a **type-only entry** when bundlers apply the `react-server` condition (Vite RSC, Webpack RSC, Turbopack, Parcel) — Server Components can import public API types without pulling client-only code into the server bundle. Per-request data fetching is handled by [@real-router/rsc-server-plugin](https://www.npmjs.com/package/@real-router/rsc-server-plugin), not this entry. See [RSC Integration wiki guide](https://github.com/greydragon888/real-router/wiki/RSC-Integration).

## Quick Start

```tsx
import { createRouter } from "@real-router/core";
import { browserPluginFactory } from "@real-router/browser-plugin";
import { RouterProvider, RouteView, Link } from "@real-router/react";

const router = createRouter([
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
]);

router.usePlugin(browserPluginFactory());
router.start();

function App() {
  return (
    <RouterProvider router={router}>
      <nav>
        <Link routeName="home">Home</Link>
        <Link routeName="users">Users</Link>
      </nav>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <HomePage />
        </RouteView.Match>
        <RouteView.Match segment="users">
          <UsersPage />
        </RouteView.Match>
        <RouteView.NotFound>
          <NotFoundPage />
        </RouteView.NotFound>
      </RouteView>
    </RouterProvider>
  );
}
```

## Hooks

| Hook                               | Returns                                                               | Re-renders                              |
| ---------------------------------- | --------------------------------------------------------------------- | --------------------------------------- |
| `useRouter()`                      | `Router`                                                              | Never                                   |
| `useNavigator()`                   | `Navigator`                                                           | Never (stable ref, safe to destructure) |
| `useRoute()`                       | `{ navigator, route, previousRoute }`                                 | Every navigation                        |
| `useRouteNode(name)`               | `{ navigator, route, previousRoute }`                                 | Only when node activates/deactivates    |
| `useRouteUtils()`                  | `RouteUtils`                                                          | Never                                   |
| `useRouterTransition()`            | `{ isTransitioning, isLeaveApproved, toRoute, fromRoute }`            | On transition start/end                 |
| `useRouteExit(handler, options?)`  | `void` — wraps `router.subscribeLeave` with abort + same-route guards | Never (stable subscription)             |
| `useRouteEnter(handler, options?)` | `void` — fires on nav-driven mount via `useRoute()` snapshot          | Never (handler stays current)           |

```tsx
// useRouteNode — re-renders only when "users.*" changes
function UsersLayout() {
  const { route } = useRouteNode("users");
  if (!route) return null;

  switch (route.name) {
    case "users":
      return <UsersList />;
    case "users.profile":
      return <UserProfile id={route.params.id} />;
    default:
      return null;
  }
}

// useNavigator — stable reference, never causes re-renders
function BackButton() {
  const navigator = useNavigator();
  return <button onClick={() => navigator.navigate("home")}>Back</button>;
}

// useRouterTransition — progress bars, loading states
function GlobalProgress() {
  const { isTransitioning } = useRouterTransition();
  if (!isTransitioning) return null;
  return <div className="progress-bar" />;
}

// useRouteExit — exit animations, draft autosave, AbortSignal-aware cleanup
function FormPage() {
  useRouteExit(async ({ signal }) => {
    await api.saveDraft(formState, { signal });
  });
  return <Form />;
}

// useRouteEnter — page-enter analytics, focus management, entry animations
function AboutPage() {
  useRouteEnter(({ route, previousRoute }) => {
    analytics.track("page_enter", {
      route: route.name,
      from: previousRoute.name,
    });
  });
  return <About />;
}
```

## Components

### `<Link>`

Navigation link with automatic active state detection. Re-renders only when its active status changes.

```tsx
<Link
  routeName="users.profile"
  routeParams={{ id: "123" }} // path channel (RFC-4 M2)
  routeSearch={{ tab: "posts" }} // query channel (RFC-4 M2)
  activeClassName="active" // default: "active"
  activeStrict={false} // default: false (ancestor match)
  ignoreQueryParams={true} // default: true
  routeOptions={{ replace: true }}
>
  View Profile
</Link>
```

#### `hash` prop — URL fragment / tab-style UIs

```tsx
<nav>
  <Link routeName="settings" hash="profile">
    Profile
  </Link>
  <Link routeName="settings" hash="account">
    Account
  </Link>
  <Link routeName="settings" hash="billing">
    Billing
  </Link>
</nav>
```

Tri-state: `undefined` preserves the current hash, `""` clears it, a value sets it. Active class is hash-aware — only the matching tab lights up. Live demo: [`examples/web/react/hash-examples/link-hash/`](../../examples/web/react/hash-examples/link-hash/). See the [Hash Fragment Support](https://github.com/greydragon888/real-router/wiki/Hash) wiki page for the full surface.

### `<RouteView>` (React 19.2+)

Declarative route matching with optional `keepAlive` — preserves component state via React's `<Activity>` API.

```tsx
<RouteView nodeName="">
  <RouteView.Match segment="users" keepAlive>
    <UsersPage /> {/* State preserved when navigating away */}
  </RouteView.Match>
  <RouteView.Match segment="settings">
    <SettingsPage /> {/* Unmounts normally */}
  </RouteView.Match>
  <RouteView.NotFound>
    <NotFoundPage />
  </RouteView.NotFound>
</RouteView>
```

#### `RouteView.Match` props

| Prop        | Type        | Description                                                                 |
| ----------- | ----------- | --------------------------------------------------------------------------- |
| `segment`   | `string`    | Route segment to match                                                      |
| `exact`     | `boolean`   | Exact match only — no descendants. Defaults to `false`.                     |
| `keepAlive` | `boolean`   | Preserve state via React `<Activity>` (React 19.2+)                         |
| `fallback`  | `ReactNode` | Shown while children suspend. Wraps children in `<Suspense>` when provided. |

#### Lazy loading with `fallback`

Pass `fallback` to code-split a route component. `RouteView.Match` wraps children in `<Suspense>` automatically:

```tsx
import { lazy } from "react";

const LazyDashboard = lazy(() => import("./Dashboard"));

<RouteView nodeName="">
  <RouteView.Match segment="dashboard" fallback={<Spinner />}>
    <LazyDashboard />
  </RouteView.Match>
</RouteView>;
```

`fallback` and `keepAlive` work together — `<Activity>` wraps the whole match including the `<Suspense>` boundary.

#### `RouteView.Self`

Renders when the active route name **exactly equals** the parent `<RouteView>`'s `nodeName`. Use it for leaf views where the parent route itself is the destination — e.g. `/users` rendering a directory page while `/users/:id` renders inside a nested `<RouteView nodeName="users">`.

```tsx
<RouteView nodeName="users">
  <RouteView.Self>
    <UsersIndex /> {/* rendered for route name === "users" */}
  </RouteView.Self>
  <RouteView.Match segment="profile">
    <UserProfile /> {/* rendered for "users.profile" and descendants */}
  </RouteView.Match>
  <RouteView.NotFound>
    <NotFoundPage />
  </RouteView.NotFound>
</RouteView>
```

| Prop       | Type        | Description                                                                                |
| ---------- | ----------- | ------------------------------------------------------------------------------------------ |
| `fallback` | `ReactNode` | Symmetric with `RouteView.Match` — wraps `children` in `<Suspense>` when defined.          |
| `children` | `ReactNode` | Content to render when the active route name equals the parent `<RouteView>`'s `nodeName`. |

First-wins: if multiple `<RouteView.Self>` elements appear, only the first contributes to the rendered output (same precedence semantics as `<RouteView.NotFound>`). An activating `<RouteView.Match>` suppresses both `Self` and `NotFound`.

### `<RouterErrorBoundary>`

Declarative error handling for navigation errors. Shows a fallback **alongside** children (not instead of) when a guard rejects or a route is not found.

```tsx
<RouterErrorBoundary
  fallback={(error, resetError) => (
    <div className="toast">
      {error.code} <button onClick={resetError}>Dismiss</button>
    </div>
  )}
  onError={(error) => analytics.track("nav_error", { code: error.code })}
>
  <Link routeName="protected">Go to Protected</Link>
</RouterErrorBoundary>
```

Auto-resets on next successful navigation. Works with both `<Link>` and imperative `router.navigate()`.

Available from both `@real-router/react` and `@real-router/react/legacy`.

### `<ClientOnly>` / `<ServerOnly>`

Paired SSR-aware boundaries. `<ClientOnly>` renders `fallback` on the server (and on the client first paint, to match SSR HTML), then swaps in `children` after mount. `<ServerOnly>` is the symmetric inverse.

```tsx
import { ClientOnly, ServerOnly } from "@real-router/react/ssr";

<ClientOnly fallback={<Skeleton />}>
  <BrowserApiWidget />
</ClientOnly>

<ServerOnly>
  <SeoMetaStrip />
</ServerOnly>
```

Implementation: `useState(false)` + `useEffect(() => setMounted(true), [])`. Server emits the SSR-side branch, client first paint matches it (no hydration mismatch), the post-mount effect triggers a single re-render that swaps the rendered branch.

Available from `@real-router/react/ssr` and `@real-router/react/legacy/ssr`. End-to-end dogfooding lives in [`examples/web/react/ssr-examples/ssr/`](../../examples/web/react/ssr-examples/ssr/) (see `e2e/ssr-boundaries.spec.ts`).

### `<Streamed>` / `<Await>` / `useDeferred`

Three pieces of the deferred-data pipeline (paired with [`@real-router/ssr-data-plugin`](https://www.npmjs.com/package/@real-router/ssr-data-plugin)'s `defer()` API). `<Streamed>` is a cross-adapter alias for `<Suspense>` so route bundles can use the same boundary name across Solid/Vue/Svelte/React. `<Await<T> name="key">` reads the deferred promise the loader published under that key and hands the resolved value to a render-prop. `useDeferred<T>(key)` returns the same promise for callers that want to compose with `use()` or a third-party suspense library.

```tsx
import { Streamed, Await, useDeferred } from "@real-router/react/ssr";

// Render-prop form — works in React 19.2+ via internal `use(promise)`.
<Streamed fallback={<Spinner />}>
  <Await<Review[]> name="reviews">
    {(reviews) => <ReviewList items={reviews} />}
  </Await>
</Streamed>;

// Manual form — works on React 18+ (`/legacy/ssr` entry).
function Reviews() {
  const reviews = use(useDeferred<Review[]>("reviews"));
  return <ReviewList items={reviews} />;
}
```

`<Await>` is React 19.2+ only (depends on `use(promise)`); `<Streamed>` and `useDeferred` ship in both `/ssr` and `/legacy/ssr`. End-to-end example: [`examples/web/react/ssr-examples/ssr-streaming/`](../../examples/web/react/ssr-examples/ssr-streaming/).

### `<HttpStatusCode>` / `<HttpStatusProvider>` / `createHttpStatusSink`

Render-time HTTP status declaration for SSR responses. Mount `<HttpStatusCode code={N} />` inside a route component (typical use: a `<RouteView.NotFound>` glob page) — it writes `N` to the nearest `<HttpStatusProvider>`'s sink during render and returns `null`. After `renderToString` / `renderToReadableStream`, read `sink.code` and pass it to your response.

```tsx
// app.tsx
import { HttpStatusCode } from "@real-router/react/ssr";

function NotFound() {
  return (
    <>
      <HttpStatusCode code={404} />
      <h1>Page not found</h1>
    </>
  );
}

// entry-server.tsx
import { renderToString } from "react-dom/server";
import {
  HttpStatusProvider,
  createHttpStatusSink,
} from "@real-router/react/ssr";

const sink = createHttpStatusSink();
const html = renderToString(
  <HttpStatusProvider sink={sink}>
    <RouterProvider router={router}>
      <App />
    </RouterProvider>
  </HttpStatusProvider>,
);
response.status(sink.code ?? 200).send(html);
```

| Export                          | Kind      | Purpose                                                                                                                           |
| ------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `<HttpStatusCode code={N}/>`    | component | Writes `code` to the optional context sink during render. Last write wins across multiple instances. No-op without a provider.    |
| `<HttpStatusProvider sink={…}>` | component | Supplies an `HttpStatusSink` to descendant `<HttpStatusCode />` via React context.                                                |
| `createHttpStatusSink()`        | utility   | Returns a fresh `{ code: number \| undefined }` sink — construct one per request on the server, read `sink.code` after rendering. |

Loader-driven errors (`LoaderNotFound` → 404, `LoaderRedirect` → 30x) keep working as before; this component covers render-time decisions only. **Streaming SSR caveat**: mount `<HttpStatusCode>` in the shell (above every `<Suspense>` that could delay it), or `await stream.allReady` before reading `sink.code` — once the response status flushes, later writes are lost.

Available from `@real-router/react/ssr` and `@real-router/react/legacy/ssr`.

## React 18 Migration

One import path change — all hooks and `Link` work identically:

```diff
- import { useRouteNode, Link } from '@real-router/react';
+ import { useRouteNode, Link } from '@real-router/react/legacy';
```

`RouteView` is not available from `/legacy`. Use `useRouteNode` with a switch/case pattern instead.

`useRouteExit` and `useRouteEnter` are also not available from `/legacy` — they depend on React 19's concurrent-mode scheduling guarantees. Use `router.subscribeLeave()` directly for exit guards, and `useEffect` for mount-time analytics on React 18.

## Ink (Terminal UI)

`@real-router/react/ink` lets you build terminal apps with the same hooks you use in the browser.

> The official Ink routing recipe ([vadimdemedes/ink#874](https://github.com/vadimdemedes/ink/pull/874), merged Feb 2026) recommends React Router's `MemoryRouter` plus hand-rolled `useInput` / `useNavigate` per menu item — there's no Link-equivalent because RR's `<Link>` renders HTML anchors, which terminals can't handle. **We ship that packaged**: `<InkLink>` is focus-aware out of the box (joins Ink's focus ring, Enter navigates, `activeColor`/`focusColor` props), and `@real-router/memory-plugin` replaces `MemoryRouter`. No boilerplate per menu entry.

Ships three entry-specific pieces alongside the shared hooks:

- `InkRouterProvider` — drop-in provider, no DOM, no aria-live.
- `InkLink` — focusable text link. Joins Ink's focus ring via `useFocus`; Enter navigates.
- Hooks re-exported unchanged.

```tsx
import { createRouter } from "@real-router/core";
import { memoryPluginFactory } from "@real-router/memory-plugin";
import {
  InkLink,
  InkRouterProvider,
  useRouteNode,
} from "@real-router/react/ink";
import { Box, Text, render } from "ink";

const router = createRouter([
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
]);

router.usePlugin(memoryPluginFactory());
await router.start("/");

const App = () => {
  const { route } = useRouteNode("");

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box columnGap={2}>
        <InkLink
          routeName="home"
          focusColor="cyan"
          activeColor="green"
          autoFocus
        >
          [ Home ]
        </InkLink>
        <InkLink routeName="users" focusColor="cyan" activeColor="green">
          [ Users ]
        </InkLink>
      </Box>
      <Text>Current: {route?.name}</Text>
    </Box>
  );
};

render(
  <InkRouterProvider router={router}>
    <App />
  </InkRouterProvider>,
);
```

**Navigation contract:** Tab moves focus between `InkLink`s, Enter calls `router.navigate(...)`. `RouteView` and the DOM `Link` are intentionally absent from this entry — compose routes with `useRouteNode("")` and a switch. `RouterErrorBoundary` is available for terminal error handling.

**Install:**

```bash
npm install @real-router/react @real-router/core @real-router/memory-plugin ink
```

`ink` is an optional peer dependency — only install it if you use `/ink`.

## Migration from react-router5

| API                                                    | react-router5 | @real-router/react |
| ------------------------------------------------------ | ------------- | ------------------ |
| `RouterProvider`, `Link`                               | Yes           | Yes                |
| `useRouter`, `useRoute`, `useRouteNode`                | Yes           | Yes                |
| `RouteView` with `keepAlive`                           | No            | Yes (React 19.2+)  |
| `useNavigator`, `useRouteUtils`, `useRouterTransition` | No            | Yes                |
| `RouterErrorBoundary` (declarative error handling)     | No            | Yes                |
| `withRouter`, `withRoute`, `routeNode` (HOCs)          | Yes           | No — use hooks     |
| `Router`, `Route`, `RouteNode` (render props)          | Yes           | No — use hooks     |

## Accessibility

Enable screen reader announcements for route changes:

```tsx
<RouterProvider router={router} announceNavigation>
  {/* Your app */}
</RouterProvider>
```

When enabled, a visually hidden `aria-live` region announces each navigation. Focus moves to the first `<h1>` on the new page. See [Accessibility guide](https://github.com/greydragon888/real-router/wiki/Accessibility) for details.

`announceNavigation` also accepts a `RouteAnnouncerOptions` object to customize the announced text:

| Option                | Type                | Description                                                                                         |
| --------------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| `prefix`              | `string`            | Prefix prepended to the resolved text (default `"Navigated to "`)                                   |
| `getAnnouncementText` | `(route) => string` | Full custom text; overrides the default `h1 → title → route-name` chain (falls back on empty/throw) |

```tsx
<RouterProvider
  router={router}
  announceNavigation={{
    getAnnouncementText: (route) => `Now on ${route.name}`,
  }}
>
  {/* Your app */}
</RouterProvider>
```

## Scroll Restoration

Opt-in preservation of scroll position across navigations:

```tsx
<RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
  {/* Your app */}
</RouterProvider>
```

Restores scroll on back/forward, scrolls to top (or `#hash`) on push. Three modes: `"restore"` (default), `"top"`, `"native"`. Custom containers via `scrollContainer: () => HTMLElement | null`. Lifecycle tied to the provider — created on mount, destroyed on unmount. Under `@real-router/browser-plugin`, replace transitions now preserve scroll position and programmatic reloads restore from `sessionStorage` (portable via `state.transition.replace` / `state.transition.reload`). See [Scroll Restoration guide](https://github.com/greydragon888/real-router/wiki/Scroll-Restoration) for the full behaviour matrix.

## Scroll Spy

Opt-in router-coordinated `IntersectionObserver` scroll spy — the URL hash tracks the topmost visible anchor as the user scrolls, syncing `state.context.url.hash` so sibling `<Link hash>` highlights stay current:

```tsx
<RouterProvider router={router} scrollSpy={{ selector: "[id]:is(h2,h3)" }}>
  {/* Your app */}
</RouterProvider>
```

Emits a forced same-route transition with `{ hash, replace: true, force: true, hashChange: true }` — the same write API as `<Link hash>` (#532), just with `replace: true` so the spy doesn't pollute history. Three anti-flicker gates: `isTransitioning` (skip emits during transitions), `coolingDown` (skip emits during smooth `scrollIntoView` after a `<Link hash>` click; cleared on `scrollend` or 500 ms timeout), and `selfEmitting` (the spy doesn't rate-limit itself). Hardcoded internals: `IntersectionObserver.threshold = 0`, rAF + 150 ms trailing debounce, MutationObserver re-observe debounced 250 ms.

Options: `{ selector: string, rootMargin?: string, scrollContainer?: () => HTMLElement | null }`. Default `rootMargin`: `"-20% 0px -60% 0px"` (anchor active when crossing the top 20% of the viewport). Empty `selector` / `undefined` = off. SSR / browsers without `IntersectionObserver` = NOOP. Requires `browser-plugin` or `navigation-plugin` (hash-plugin and memory-plugin → warn-once + NOOP — they don't claim `state.context.url`).

Live demo: [`examples/web/react/hash-examples/scroll-spy/`](../../examples/web/react/hash-examples/scroll-spy/) (12 sections, TOC sidebar, plugin & spy-mode switchers, 10 e2e scenarios). See [Scroll Spy guide](https://github.com/greydragon888/real-router/wiki/Scroll-Spy) for the full API surface and recipes.

## View Transitions

Opt-in animated route transitions via the browser's [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API):

```tsx
<RouterProvider router={router} viewTransitions>
  {/* Your app */}
</RouterProvider>
```

No-op on unsupported browsers (Firefox as of 2026-04, SSR). Customization is pure CSS via `::view-transition-*` pseudo-elements and `view-transition-name` for hero morphs. See [View Transitions guide](https://github.com/greydragon888/real-router/wiki/View-Transitions) for patterns.

## Documentation

Full documentation: [Wiki](https://github.com/greydragon888/real-router/wiki)

- [RouterProvider](https://github.com/greydragon888/real-router/wiki/RouterProvider) · [RouteView](https://github.com/greydragon888/real-router/wiki/RouteView) · [RouterErrorBoundary](https://github.com/greydragon888/real-router/wiki/RouterErrorBoundary) · [Link](https://github.com/greydragon888/real-router/wiki/Link) · [Scroll Restoration](https://github.com/greydragon888/real-router/wiki/Scroll-Restoration) · [Scroll Spy](https://github.com/greydragon888/real-router/wiki/Scroll-Spy) · [View Transitions](https://github.com/greydragon888/real-router/wiki/View-Transitions)
- [useRouter](https://github.com/greydragon888/real-router/wiki/useRouter) · [useRoute](https://github.com/greydragon888/real-router/wiki/useRoute) · [useRouteNode](https://github.com/greydragon888/real-router/wiki/useRouteNode) · [useNavigator](https://github.com/greydragon888/real-router/wiki/useNavigator) · [useRouteUtils](https://github.com/greydragon888/real-router/wiki/useRouteUtils) · [useRouterTransition](https://github.com/greydragon888/real-router/wiki/useRouterTransition) · [useRouteExit](https://github.com/greydragon888/real-router/wiki/useRouteExit) · [useRouteEnter](https://github.com/greydragon888/real-router/wiki/useRouteEnter)

## Examples

14 runnable examples — each is a standalone Vite app. Run: `cd examples/web/react/basic && pnpm dev`

[basic](../../examples/web/react/basic) · [nested-routes](../../examples/web/react/nested-routes) · [auth-guards](../../examples/web/react/auth-guards) · [data-loading](../../examples/web/react/data-loading) · [lazy-loading](../../examples/web/react/lazy-loading) · [async-guards](../../examples/web/react/async-guards) · [hash-routing](../../examples/web/react/hash-routing) · [persistent-params](../../examples/web/react/persistent-params) · [error-handling](../../examples/web/react/error-handling) · [dynamic-routes](../../examples/web/react/dynamic-routes) · [keep-alive](../../examples/web/react/keep-alive) · [legacy-entry](../../examples/web/react/legacy-entry) · [hmr](../../examples/web/react/hmr) · [combined](../../examples/web/react/combined)

## Related Packages

| Package                                                                                  | Description                          |
| ---------------------------------------------------------------------------------------- | ------------------------------------ |
| [@real-router/core](https://www.npmjs.com/package/@real-router/core)                     | Core router (required dependency)    |
| [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) | Browser History API integration      |
| [@real-router/sources](https://www.npmjs.com/package/@real-router/sources)               | Subscription layer (used internally) |
| [@real-router/route-utils](https://www.npmjs.com/package/@real-router/route-utils)       | Route tree queries (`useRouteUtils`) |

## Contributing

See [contributing guidelines](../../CONTRIBUTING.md) for development setup and PR process.

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
