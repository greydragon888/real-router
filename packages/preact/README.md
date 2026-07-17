# @real-router/preact

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Preact integration for [Real-Router](https://github.com/greydragon888/real-router) — hooks, components, and context providers.

## Installation

```bash
npm install @real-router/preact @real-router/core
```

`@real-router/core` is the entry-point dependency the API revolves around;
`@real-router/route-utils` and `@real-router/sources` are pulled in automatically
as transitive deps (used internally by `useRouteUtils` / hook subscriptions).
Add `@real-router/browser-plugin` (or `hash-plugin` / `navigation-plugin` /
`memory-plugin`) when you need History API integration — the Quick Start below
uses it.

**Peer dependency:** `preact` >= 10.28.0 (Preact 10) or ^11.0.0-0 (Preact 11 beta and later). The adapter imports DOM types (`HTMLAttributes`, `TargetedMouseEvent`) from the top-level `preact` namespace introduced in 10.28; Preact 11's JSX-namespace restructure preserves the same imports.

## Quick Start

```tsx
import { createRouter } from "@real-router/core";
import { browserPluginFactory } from "@real-router/browser-plugin";
import { RouterProvider, RouteView, Link } from "@real-router/preact";

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

| Hook                               | Returns                                                               | Re-renders                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `useRouter()`                      | `Router`                                                              | Never                                                                                                      |
| `useNavigator()`                   | `Navigator`                                                           | Never (stable ref, safe to destructure)                                                                    |
| `useRoute()`                       | `{ navigator, route, previousRoute }`                                 | Every navigation                                                                                           |
| `useRouteNode(name)`               | `{ navigator, route, previousRoute }`                                 | Only when node activates/deactivates                                                                       |
| `useRouteUtils()`                  | `RouteUtils`                                                          | Never                                                                                                      |
| `useRouterTransition()`            | `{ isTransitioning, isLeaveApproved, toRoute, fromRoute }`            | On transition start/end                                                                                    |
| `useRouteExit(handler, options?)`  | `void` — wraps `router.subscribeLeave` with abort + same-route guards | Never (stable subscription)                                                                                |
| `useRouteEnter(handler, options?)` | `void` — fires on nav-driven mount via `useRoute()` snapshot          | Every navigation (host component reads `useRoute()`); handler ref + subscription are stable across renders |

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
function FadeOut() {
  const ref = useRef<HTMLDivElement>(null);
  useRouteExit(async ({ signal }) => {
    const el = ref.current;
    if (!el) return;
    el.classList.add("fade-out");
    const cleanup = () => el.classList.remove("fade-out");
    signal.addEventListener("abort", cleanup, { once: true });
    el.getBoundingClientRect(); // style flush
    await Promise.allSettled(el.getAnimations().map((a) => a.finished));
    cleanup();
  });
  return <div ref={ref}>...</div>;
}

// useRouteEnter — page-enter analytics, focus management, entry animations
function PageEnterAnalytics() {
  useRouteEnter(({ route, previousRoute }) => {
    analytics.track("page_enter", {
      route: route.name,
      from: previousRoute.name,
    });
  });
  return null;
}
```

## Components

### `<Link>`

Navigation link with automatic active state detection. Re-renders only when its active status changes.

```tsx
<Link
  routeName="users.profile"
  routeParams={{ id: "123" }}
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
<Link routeName="settings" hash="profile">Profile</Link>
<Link routeName="settings" hash="account">Account</Link>
```

Tri-state: `undefined` preserves the current hash, `""` clears it, a value sets it. Active class is hash-aware — only the matching tab lights up. Live demo: [`examples/web/react/hash-examples/link-hash/`](../../examples/web/react/hash-examples/link-hash/) — behavior is identical across adapters, only template syntax differs. See the [Hash Fragment Support](https://github.com/greydragon888/real-router/wiki/Hash) wiki page for the full surface.

### `<RouteView>`

Declarative route matching. Renders the first matching `<RouteView.Match>` child; falls back to `<RouteView.Self>` when the active route name equals `nodeName`, or `<RouteView.NotFound>` for `UNKNOWN_ROUTE`.

```tsx
<RouteView nodeName="">
  <RouteView.Match segment="users">
    <UsersPage />
  </RouteView.Match>
  <RouteView.Match segment="settings">
    <SettingsPage />
  </RouteView.Match>
  <RouteView.NotFound>
    <NotFoundPage />
  </RouteView.NotFound>
</RouteView>
```

> **Note:** Unlike the React adapter, `keepAlive` is not supported. Preact has no equivalent of React's `<Activity>` API. Components unmount completely when navigating away.

#### `RouteView.Match` props

| Prop       | Type                | Required | Description                                                                   |
| ---------- | ------------------- | -------- | ----------------------------------------------------------------------------- |
| `segment`  | `string`            | Yes      | Route segment to match                                                        |
| `exact`    | `boolean`           | No       | When `true`, matches only the exact route (not descendants). Default: `false` |
| `fallback` | `ComponentChildren` | No       | Shown while children suspend. Wraps children in `<Suspense>` when provided.   |
| `children` | `ComponentChildren` | Yes      | Content to render when the active route matches `segment`                     |

#### `<RouteView.Self>` and `<RouteView.NotFound>`

Three fallback slots compose inside a `<RouteView nodeName="…">`:

| Element                | Fires when                                                                  | Props                                         | Render position               |
| ---------------------- | --------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------- |
| `<RouteView.Match>`    | Active route segment matches `segment` (or descendant when `exact={false}`) | `segment` / `exact` / `fallback` / `children` | Inline at source position     |
| `<RouteView.Self>`     | Active route name **exactly equals** parent's `nodeName`                    | `fallback` / `children`                       | Appended after Match elements |
| `<RouteView.NotFound>` | Active route name is `UNKNOWN_ROUTE` AND no Match activated                 | `children`                                    | Appended after Match elements |

Precedence:

1. `<Match>` first-wins — duplicate segments short-circuit; subsequent `<Match>` with the same segment are not rendered.
2. `<Self>` first-wins — only the first `<RouteView.Self>` contributes; subsequent ones are ignored.
3. `<NotFound>` **first-wins** — when multiple `<RouteView.NotFound>` siblings are declared (unusual but legal), only the _first_ one renders. Symmetric with the other two slots (#1439); prefer a single `<NotFound>` per RouteView.
4. An activating `<Match>` suppresses both `<Self>` and `<NotFound>`.
5. When no `<Match>` activates: `<Self>` wins over `<NotFound>` if both would fire (occurs only when `nodeName === UNKNOWN_ROUTE`, narrow edge case).

```tsx
<RouteView nodeName="users">
  <RouteView.Self>
    <UsersIndex /> {/* route name === "users" → renders */}
  </RouteView.Self>
  <RouteView.Match segment="profile">
    <UserProfile /> {/* "users.profile" and descendants → renders */}
  </RouteView.Match>
  <RouteView.NotFound>
    <NotFoundPage /> {/* UNKNOWN_ROUTE → renders */}
  </RouteView.NotFound>
</RouteView>
```

#### Lazy loading with `fallback` (experimental)

Preact's `lazy` and `Suspense` come from `preact/compat`. Support is experimental — test before shipping to production.

```tsx
import { lazy } from "preact/compat";

const LazyDashboard = lazy(() => import("./Dashboard"));

<RouteView nodeName="">
  <RouteView.Match segment="dashboard" fallback={<Spinner />}>
    <LazyDashboard />
  </RouteView.Match>
</RouteView>;
```

### Advanced exports

For custom integrations (e.g., writing your own hook on top of the router
context), the low-level contexts are also exported:

```tsx
import {
  RouterContext, // Raw Router instance
  NavigatorContext, // Navigator (stable ref)
  RouteContext, // { navigator, route, previousRoute }
  type RouteViewProps,
  type RouteViewMatchProps,
  type RouteViewSelfProps,
  type RouteViewNotFoundProps,
} from "@real-router/preact";
```

Most apps should prefer the `use*` hooks above over consuming contexts directly.

### `<RouterErrorBoundary>`

Declarative error handling for navigation errors. Shows a fallback **alongside** children (not instead of) when a guard rejects or a route is not found.

```tsx
import { RouterErrorBoundary } from "@real-router/preact";

<RouterErrorBoundary
  fallback={(error, resetError) => (
    <div className="toast">
      {error.code} <button onClick={resetError}>Dismiss</button>
    </div>
  )}
  onError={(error, toRoute, fromRoute) =>
    analytics.track("nav_error", {
      code: error.code,
      to: toRoute?.name,
      from: fromRoute?.name,
    })
  }
>
  <Link routeName="protected">Go to Protected</Link>
</RouterErrorBoundary>;
```

Auto-resets on next successful navigation. Works with both `<Link>` and imperative `router.navigate()`.

## SSR-feature surface — `@real-router/preact/ssr`

All SSR-aware components, hooks, and utilities live at the `/ssr` subpath — mirror of `@real-router/react/ssr` (same exports, same API). Eight exports total: `<ClientOnly>`, `<ServerOnly>`, `<Streamed>`, `<Await>`, `<HttpStatusCode>`, `<HttpStatusProvider>`, `useDeferred`, `createHttpStatusSink`.

### `<ClientOnly>` / `<ServerOnly>`

Paired SSR-aware boundaries. `<ClientOnly>` renders `fallback` on the server (and on the client first paint, to match SSR HTML), then swaps in `children` after mount. `<ServerOnly>` is the symmetric inverse.

```tsx
import { ClientOnly, ServerOnly } from "@real-router/preact/ssr";

<ClientOnly fallback={<Skeleton />}>
  <BrowserApiWidget />
</ClientOnly>

<ServerOnly>
  <SeoMetaStrip />
</ServerOnly>;
```

Implementation: `useState(false)` + `useEffect(() => setMounted(true), [])` from `preact/hooks`. End-to-end dogfooding lives in [`examples/web/preact/ssr-examples/ssr/`](../../examples/web/preact/ssr-examples/ssr/) (see `e2e/ssr-boundaries.spec.ts`).

### `<Streamed>` / `<Await>` / `useDeferred`

Three pieces of the deferred-data pipeline (paired with [`@real-router/ssr-data-plugin`](https://www.npmjs.com/package/@real-router/ssr-data-plugin)'s `defer()` API). `<Streamed>` is a cross-adapter alias for Preact's `<Suspense>` (from `preact/compat`). `<Await<T> name="key">` reads the deferred promise the loader published under that key and hands the resolved value to a render-prop via Preact's Suspense-throwing convention. `useDeferred<T>(key)` returns the same promise for callers composing with a third-party Suspense-aware lib.

```tsx
import { Streamed, Await, useDeferred } from "@real-router/preact/ssr";

<Streamed fallback={<Spinner />}>
  <Await<Review[]> name="reviews">
    {(reviews) => <ReviewList items={reviews} />}
  </Await>
</Streamed>;
```

End-to-end example: [`examples/web/preact/ssr-examples/ssr-streaming/`](../../examples/web/preact/ssr-examples/ssr-streaming/).

### `<HttpStatusCode>` / `<HttpStatusProvider>` / `createHttpStatusSink`

Render-time HTTP status declaration for SSR responses. Mount `<HttpStatusCode code={N} />` inside a route component (typical use: a `<RouteView.NotFound>` glob page) — it writes `N` to the nearest `<HttpStatusProvider>`'s sink during render and returns `null`. After `renderToString`, read `sink.code` and pass it to your response.

```tsx
// app.tsx
import { HttpStatusCode } from "@real-router/preact/ssr";

function NotFound() {
  return (
    <>
      <HttpStatusCode code={404} />
      <h1>Page not found</h1>
    </>
  );
}

// entry-server.tsx
import { renderToString } from "preact-render-to-string";
import {
  HttpStatusProvider,
  createHttpStatusSink,
} from "@real-router/preact/ssr";

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
| `<HttpStatusProvider sink={…}>` | component | Supplies an `HttpStatusSink` to descendant `<HttpStatusCode />` via Preact context.                                               |
| `createHttpStatusSink()`        | utility   | Returns a fresh `{ code: number \| undefined }` sink — construct one per request on the server, read `sink.code` after rendering. |

Loader-driven errors (`LoaderNotFound` → 404, `LoaderRedirect` → 30x) keep working as before; this component covers render-time decisions only.

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

Restores scroll on back/forward, scrolls to top (or `#hash`) on push. Three modes: `"restore"` (default), `"top"`, `"native"`. Custom containers via `scrollContainer: () => HTMLElement | null`. Override the `sessionStorage` key via `storageKey` (default `"real-router:scroll"`) when isolating multiple routers on one origin. Lifecycle tied to the provider — created on mount, destroyed on unmount. Under `@real-router/browser-plugin`, replace transitions now preserve scroll position and programmatic reloads restore from `sessionStorage` (portable via `state.transition.replace` / `state.transition.reload`). See [Scroll Restoration guide](https://github.com/greydragon888/real-router/wiki/Scroll-Restoration) for the full behaviour matrix.

## Scroll Spy

Opt-in router-coordinated `IntersectionObserver` scroll spy — the URL hash tracks the topmost visible anchor as the user scrolls, syncing `state.context.url.hash` so sibling `<Link hash>` highlights stay current:

```tsx
<RouterProvider router={router} scrollSpy={{ selector: "[id]:is(h2,h3)" }}>
  {/* Your app */}
</RouterProvider>
```

Emits a forced same-route transition with `{ hash, replace: true, force: true, hashChange: true }` — the same write API as `<Link hash>` (#532), just with `replace: true` so the spy doesn't pollute history. Anti-flicker gates: `isTransitioning` (skip emits during transitions), `coolingDown` (skip emits during smooth `scrollIntoView` after a `<Link hash>` click; cleared on `scrollend` or 500 ms timeout), and `selfEmitting` (spy doesn't rate-limit itself). Hardcoded internals: `IntersectionObserver.threshold = 0`, rAF + 150 ms trailing debounce, MutationObserver re-observe debounced 250 ms.

Options: `{ selector: string, rootMargin?: string, scrollContainer?: () => HTMLElement | null }`. Default `rootMargin`: `"-20% 0px -60% 0px"`. Empty `selector` / `undefined` = off. SSR / browsers without `IntersectionObserver` = NOOP. Requires `browser-plugin` or `navigation-plugin` (hash-plugin / memory-plugin → warn-once + NOOP).

Behaviour is identical to the React adapter — see the [React Scroll Spy demo](../../examples/web/react/hash-examples/scroll-spy/) (12 sections, TOC sidebar, 10 e2e scenarios) and the [Scroll Spy guide](https://github.com/greydragon888/real-router/wiki/Scroll-Spy).

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

20 runnable examples — each is a standalone Vite app. Run: `cd examples/web/preact/basic && pnpm dev`

**Routing fundamentals:** [basic](../../examples/web/preact/basic) · [nested-routes](../../examples/web/preact/nested-routes) · [dynamic-routes](../../examples/web/preact/dynamic-routes) · [combined](../../examples/web/preact/combined)

**Data & guards:** [auth-guards](../../examples/web/preact/auth-guards) · [async-guards](../../examples/web/preact/async-guards) · [data-loading](../../examples/web/preact/data-loading) · [lazy-loading](../../examples/web/preact/lazy-loading) · [error-handling](../../examples/web/preact/error-handling)

**URL features:** [hash-routing](../../examples/web/preact/hash-routing) · [persistent-params](../../examples/web/preact/persistent-params) · [search-schema](../../examples/web/preact/search-schema)

**Animations:** [motion-animations](../../examples/web/preact/animation-examples/motion-animations) · [page-animations](../../examples/web/preact/animation-examples/page-animations) · [route-animations](../../examples/web/preact/animation-examples/route-animations) · [view-transitions](../../examples/web/preact/animation-examples/view-transitions)

**SSR:** [ssg](../../examples/web/preact/ssr-examples/ssg) · [ssr](../../examples/web/preact/ssr-examples/ssr) · [ssr-mixed](../../examples/web/preact/ssr-examples/ssr-mixed) · [ssr-streaming](../../examples/web/preact/ssr-examples/ssr-streaming)

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
