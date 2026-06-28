# @real-router/svelte

> Svelte 5 bindings with compiler-driven Runes reactivity

## Single Entry Point

```typescript
import { RouterProvider, useRouteNode, Link, RouteView } from '@real-router/svelte';
```

**Peer dependency:** `svelte` >= 5.7.0

**Architecture:** Primarily flat structure (one `utils/` subdir for `createHttpStatusSink`). All code lives in `src/`. **Two entry points** — main + `/ssr` subpath (mirrors `@real-router/react/ssr`). RouteView included but without `keepAlive` (Svelte has no equivalent).

**RouterProvider Props:**

| Prop                  | Type      | Default | Description                                                                                    |
| --------------------- | --------- | ------- | ---------------------------------------------------------------------------------------------- |
| `router`              | `Router`  | —       | Router instance (required)                                                                     |
| `announceNavigation`  | `boolean` | `false` | Enable WCAG-compliant screen reader announcements on route change via `aria-live` region       |
| `scrollRestoration`   | `ScrollRestorationOptions` | `undefined` | Opt into scroll capture + restoration. Keyed by `(name, canonicalJson(params))`. |
| `scrollSpy`           | `ScrollSpyOptions` | `undefined` | Opt into router-coordinated `IntersectionObserver`-driven URL hash spy (#575). Shape: `{ selector, rootMargin?, scrollContainer? }`. Reactive via `$effect` — primitives wrapped in `$derived`, `scrollContainer` getter pulled via `untrack`. Empty `selector` / `undefined` = off. Requires `browser-plugin` or `navigation-plugin`; under hash-plugin / memory-plugin → warn-once + NOOP. |
| `viewTransitions`     | `boolean` | `false` | Opt into View Transitions API integration via `createViewTransitions` utility. Reactive via `$effect` — toggling creates/destroys the utility. No-op on SSR and browsers without `document.startViewTransition`. CSS customization via `::view-transition-*` pseudo-elements |

### Source Structure

```
src/
├── composables/                          # All composables (.svelte.ts — require Svelte compiler)
│   ├── useRouter.svelte.ts
│   ├── useNavigator.svelte.ts
│   ├── useRoute.svelte.ts
│   ├── useRouteNode.svelte.ts
│   ├── useIsActiveRoute.svelte.ts        # Internal — used by Link only
│   ├── useRouteUtils.svelte.ts
│   ├── useRouterTransition.svelte.ts
│   ├── useRouteExit.svelte.ts            # Wraps subscribeLeave with abort + same-route guards
│   ├── useRouteEnter.svelte.ts           # Fires on nav-driven mount via $effect + transition.from
│   └── useDeferred.svelte.ts             # /ssr — reads state.context.ssrDataDeferred[key]
├── components/                           # Svelte components (.svelte) — 10 total (4 client + 6 SSR)
│   ├── Link.svelte
│   ├── RouteView.svelte                  # Declarative route matching via named snippets
│   ├── Lazy.svelte                       # Lazy-load route content with fallback
│   ├── RouterErrorBoundary.svelte        # Declarative error handling — uses createDismissableError
│   ├── ClientOnly.svelte                 # /ssr — server fallback → client children swap
│   ├── ServerOnly.svelte                 # /ssr — symmetric inverse of ClientOnly
│   ├── Streamed.svelte                   # /ssr — alias for {#await} block
│   ├── Await.svelte                      # /ssr — reads useDeferred(name) via {#await}
│   ├── HttpStatusCode.svelte             # /ssr — writes sink.code at component init
│   └── HttpStatusProvider.svelte         # /ssr — provides HttpStatusSink via setContext
├── actions/                              # Actions
│   └── link.svelte.ts                    # createLinkAction factory
├── dom-utils/                            # Symlink to shared/dom-utils — shouldNavigate, buildHref,
│                                         # navigateWithHash, buildActiveClassName, applyLinkA11y,
│                                         # shallowEqual, createRouteAnnouncer, createScrollRestoration,
│                                         # createScrollSpy (#575), createViewTransitions,
│                                         # createDirectionTracker
├── utils/
│   └── createHttpStatusSink.ts           # /ssr — fresh { code: undefined } sink per request
├── RouterProvider.svelte
├── context.ts                            # Four string keys (ROUTER_KEY, NAVIGATOR_KEY, ROUTE_KEY, HTTP_STATUS_KEY — last is internal)
├── constants.ts                          # EMPTY_PARAMS, EMPTY_OPTIONS (frozen singletons), NOOP
├── createReactiveSource.svelte.ts        # Reactive bridge (createSubscriber from svelte/reactivity)
├── createRouteContext.svelte.ts          # Helper that builds RouteContext from a reactive source (used by RouterProvider + useRouteNode)
├── index.ts                              # Main entry — client API
├── ssr.ts                                # /ssr subpath — 8 exports mirroring @real-router/react/ssr
└── types.ts
```

### Build (svelte-package)

`svelte-package` outputs individual files — the consumer's bundler handles tree-shaking. Two entry points (`index` + `ssr`):

```
dist/
├── index.js          # ESM barrel (client API)
├── index.d.ts
├── ssr.js            # ESM barrel (/ssr subpath: 8 exports)
├── ssr.d.ts
├── RouterProvider.svelte
├── components/
│   ├── Link.svelte
│   ├── RouteView.svelte
│   ├── Lazy.svelte
│   ├── RouterErrorBoundary.svelte
│   ├── ClientOnly.svelte
│   ├── ServerOnly.svelte
│   ├── Streamed.svelte
│   ├── Await.svelte
│   ├── HttpStatusCode.svelte
│   └── HttpStatusProvider.svelte
├── composables/
│   └── *.svelte.js   # incl. useDeferred.svelte.js
└── utils/
    └── createHttpStatusSink.js
```

## Architecture

**Triple String Key Pattern:**

- `ROUTER_KEY` (`"real-router:router"`) — Router instance (stable, never reactive)
- `NAVIGATOR_KEY` (`"real-router:navigator"`) — Navigator (stable, derived from router)
- `ROUTE_KEY` (`"real-router:route"`) — `{ navigator, route: { current }, previousRoute: { current } }` (reactive `.current` getters update on navigation)

**Subscription Layer:** Composables use `@real-router/sources` (`createRouteSource`, `createRouteNodeSource`, `createActiveRouteSource`, `getTransitionSource`, `createDismissableError`) via `createReactiveSource` (createSubscriber from `svelte/reactivity`).

## Composables

| Composable | Returns | Reactive? |
| --- | --- | --- |
| `useRouter()` | `Router` | Never |
| `useNavigator()` | `Navigator` — exposes navigate, subscribe, subscribeLeave, isLeaveApproved, and more | Never |
| `useRoute()` | `{ navigator, route: { current }, previousRoute: { current } }` | `.current` changes on every navigation |
| `useRouteNode(name)` | `{ navigator, route: { current }, previousRoute: { current } }` | `.current` changes when node active/inactive |
| `useRouteUtils()` | `RouteUtils` | Never |
| `useRouterTransition()` | `{ current: RouterTransitionSnapshot }` — includes `isLeaveApproved` field | `.current` changes on transition start/end |
| `useIsActiveRoute()` | `{ current: boolean }` | **INTERNAL ONLY** |
| `useRouteExit(handler, options?)`  | `void` — wraps `router.subscribeLeave` with abort + same-route guards (handler captured at init) | Never (subscription is stable) |
| `useRouteEnter(handler, options?)` | `void` — fires once on nav-driven mount via `useRoute()` + `$effect` (handler captured at init) | Never (effect runs on `route.current` changes) |

## Exports

| Export                  | Type      | Description                                    |
| ----------------------- | --------- | ---------------------------------------------- |
| `RouterProvider`        | Component | Context provider for router instance           |
| `Link`                  | Component | Navigation link with active state detection    |
| `RouteView`             | Component | Declarative route matching                     |
| `Lazy`                  | Component | Lazy-load route content with fallback          |
| `RouterErrorBoundary`   | Component | Declarative navigation error handling          |
| `useRouter()`           | Composable| Get router instance                            |
| `useNavigator()`        | Composable| Get navigator (stable ref, never reactive)     |
| `useRoute()`            | Composable| Subscribe to all route changes (throws if no active state) |
| `useRouteNode(name)`    | Composable| Subscribe to specific node changes             |
| `useRouteUtils()`       | Composable| Get route tree utilities                       |
| `useRouterTransition()` | Composable| Subscribe to transition state                  |
| `useRouteExit(handler, options?)` | Composable | Subscribe to `subscribeLeave` with abort + same-route guards |
| `useRouteEnter(handler, options?)` | Composable | Fire once on nav-driven mount via `$effect` |
| `createLinkAction`      | Factory   | Create navigation action (`use:link`)           |
| `createReactiveSource`  | Primitive | Bridge `RouterSource<T>` → reactive `{ current: T }` |
| `ROUTER_KEY`, `NAVIGATOR_KEY`, `ROUTE_KEY` | Constants | Svelte context keys (re-exported for advanced patterns) |
| `LinkProps`, `RouteContext`, `LinkActionParams` | Types | Adapter-specific public types |
| `RouteExitContext`, `RouteExitHandler`, `UseRouteExitOptions` | Types | `useRouteExit` API surface |
| `RouteEnterContext`, `RouteEnterHandler`, `UseRouteEnterOptions` | Types | `useRouteEnter` API surface |
| `Navigator`, `RouterTransitionSnapshot`, `RouterErrorSnapshot` | Types | Re-exported from core/sources for convenience |

## Differences from React, Preact, Vue, and Solid Adapters

| Aspect | React/Preact | Vue | Solid | Svelte |
|--------|--------------|-----|-------|--------|
| Composable return types | Values | Values with ShallowRefs | Accessors (`Accessor<T>`) | `{ current: T }` getter objects |
| External store bridge | `useSyncExternalStore` / polyfill | `useRefFromSource` | `createSignalFromSource` | `createReactiveSource` |
| `memo()` | Required | Not needed | Not needed | Not needed |
| Params stabilization | `canonicalJson` in sources | Same | Same | Same |
| Active class on Link | `className` string concat | `class` string concat | `classList` object | `class` string concat |
| Context count | 3 (Preact) / 2 (React) | 3 | 2 | 3 |
| `keepAlive` / Activity | React 19.2+ only | Vue native `<KeepAlive>` | Not available | Not available |
| Entry points | Main + Legacy (React) / Single (Preact) | Single | Single | Single |
| Build tool | tsdown | tsdown | rollup + babel-preset-solid | svelte-package |
| Components | JSX (.tsx) | `defineComponent` + `h()` (.ts) | JSX (.tsx) | `.svelte` SFC |
| Composable files | .tsx | .ts | .tsx | `.svelte.ts` |
| RouteView child detection | Element type markers | `vnode.type === Match` | Symbol `$$type` markers | Named snippets (rest `$props()`) |

## Promise-Based Navigation

Link uses `.catch(() => {})` to suppress unhandled rejection warnings:

```typescript
router.navigate(routeName, routeParams, routeOptions).catch(() => {});
```

## SSR-feature surface — `@real-router/svelte/ssr`

All SSR-aware components/composables live at the `/ssr` subpath. Nine exports total — 8 runtime + 1 type re-export (`HttpStatusSink`) — symmetric with `@real-router/react/ssr`:

| Export | Kind | Purpose |
|---|---|---|
| `<ClientOnly>` | component | `$state(false)` + `$effect` + named snippets (`children`, `fallback`). `$effect` is browser-only — server emits fallback. |
| `<ServerOnly>` | component | Symmetric inverse. |
| `<Streamed>` | component | Cross-adapter alias for Svelte's native `{#await}` block. |
| `<Await name="key">` | component | Reads `useDeferred(name)` and renders the resolved value through `{#await}`. |
| `<HttpStatusCode code={N}/>` | component | Render-time HTTP status declaration. Writes `code` to the nearest `<HttpStatusProvider>`'s sink at component init via `getContext`. Last write wins. No-op without provider. |
| `<HttpStatusProvider {sink}>` | component | Provides an `HttpStatusSink` via `setContext(HTTP_STATUS_KEY, sink)`. |
| `useDeferred<T>(key)` | composable | Returns the deferred Promise from `state.context.ssrDataDeferred[key]`. |
| `createHttpStatusSink()` | utility | Returns a fresh `HttpStatusSink` (`{ code: number \| undefined }`) — construct one per request, read `sink.code` after `await render()` from `svelte/server` to apply to the response. |

```svelte
<script lang="ts">
  import {
    ClientOnly,
    HttpStatusProvider,
    HttpStatusCode,
    createHttpStatusSink,
  } from "@real-router/svelte/ssr";

  const sink = createHttpStatusSink();
</script>

<HttpStatusProvider {sink}>
  {#snippet children()}
    <ClientOnly>
      {#snippet children()}
        <BrowserApiWidget />
      {/snippet}
      {#snippet fallback()}
        <Skeleton />
      {/snippet}
    </ClientOnly>
  {/snippet}
</HttpStatusProvider>

<!-- inside NotFound.svelte -->
<HttpStatusCode code={404} />
```

Implementation: `<HttpStatusCode>` reads `getContext<HttpStatusSink | undefined>(HTTP_STATUS_KEY)` at component init and writes `sink.code = code` once. The write is wrapped in `// svelte-ignore state_referenced_locally` because the one-time-write contract is intentional — replacing the code mid-render isn't supported (consumers should remount via `{#if}`).

## Gotchas

### `useRouteExit` / `useRouteEnter` Handler Is Captured At Init

Svelte composables run **once** at component init — the `handler` argument is
captured in closure at the call site and is **not reactive**. Replacing the
handler reference between renders has no effect (composables don't re-run on
prop changes). To vary behavior over time, read `$state` / `$derived` values
**inside** the handler body:

```svelte
<script lang="ts">
  let draft = $state<Draft | null>(null);

  useRouteExit(async ({ signal }) => {
    if (draft) await api.save(draft, { signal });
  });
</script>
```

Same applies to `useRouteEnter`. This contrasts with React/Preact, where
`useRouteExit` keeps a `handlerRef` that's updated on every render.

### getContext Must Be Called During Component Init

`getContext` (and therefore all composables) must be called synchronously during component initialization — not inside event handlers, `$effect`, or async callbacks:

```svelte
<script lang="ts">
  import { useRoute } from '@real-router/svelte';

  // CORRECT — called during init
  const { route } = useRoute();

  // WRONG — called inside $effect
  $effect(() => {
    const { route } = useRoute(); // throws: getContext called outside component init
  });
</script>
```

### .svelte.ts Files Need the Svelte Compiler

Files with the `.svelte.ts` extension use Runes (`$state`, `$derived`, `$effect`, `createSubscriber`). They require the Svelte compiler — you can't import them from plain `.ts` files or run them with `tsc` alone. All composables in this package are `.svelte.ts` for this reason.

### createSubscriber Is Lazy

`createReactiveSource` uses `createSubscriber`, which only subscribes to the external source when `.current` is read inside a reactive context (a template, `$derived`, or `$effect`). Reading `.current` outside a reactive context still returns the current snapshot but doesn't register a subscription:

```svelte
<script lang="ts">
  import { useRouteNode } from '@real-router/svelte';

  const { route } = useRouteNode("users");

  // WRONG — read outside reactive context, no subscription registered
  console.log(route.current?.name);

  // CORRECT — read inside $derived, subscription registered
  const routeName = $derived(route.current?.name);
</script>

<!-- CORRECT — read in template, subscription registered -->
<p>{route.current?.name}</p>
```

**Corollary — all readers gone → subscription dropped → stale on re-show.**
The laziness cuts both ways. When **every** `.current` reader disappears at once
— e.g. the whole app sits behind a plain `{#if loggedIn}` login-gate — the last
subscriber unwinds and the underlying `createRouteSource` disconnects from the
router. A navigation that happens *while hidden* (a post-login deep-link
redirect, a restored route) is missed; when the gate re-opens, the first
`.current` read replays the **stale** pre-navigation snapshot until the next
navigation. Unlike React (needs `<Activity>`) or Solid (needs a lifted-source
composition), Svelte reaches this with an ordinary `{#if}` around the readers —
the widest reachability in the adapter series, and a realistic auth-flow pattern.

The window stays closed as long as **any** mounted reader is alive (a single
`RouteView`, a `useRoute()` consumer, or a template `{route.current}` anywhere),
so it only bites when literally all of them are gated off together. Root cause is
`@real-router/sources` ([#765](https://github.com/greydragon888/real-router/issues/765)
— `createRouteSource` doesn't reconcile on re-subscribe); once it lands this
collapses to "the subscription drops with no readers, and reconcile catches up
on the next read."

### Snippet Names Must Be Valid JS Identifiers

`RouteView` uses rest `$props()` to collect named snippets. Snippet names must be valid JavaScript identifiers and must match the route segment name exactly. `notFound` is reserved for the fallback:

```svelte
<!-- CORRECT — segment "users" matches route "users.*" -->
<RouteView nodeName="">
  {#snippet users()}
    <UsersPage />
  {/snippet}
  {#snippet notFound()}
    <NotFoundPage />
  {/snippet}
</RouteView>

<!-- WRONG — hyphens are not valid in identifiers -->
{#snippet user-profile()}
  ...
{/snippet}
```

### Svelte 5 Uses onclick, Not on:click

Svelte 5 event attributes are lowercase DOM properties (`onclick`, `onkeydown`, etc.). The Svelte 4 `on:click` directive syntax is deprecated:

```svelte
<!-- CORRECT — Svelte 5 -->
<button onclick={handleClick}>Click me</button>

<!-- WRONG — Svelte 4 syntax, deprecated in Svelte 5 -->
<button on:click={handleClick}>Click me</button>
```

### {@render children()} for Rendering Children

Svelte 5 snippets replace slots. Use `{@render children?.()}` to render children passed as a `Snippet` prop:

```svelte
<!-- CORRECT -->
{@render children?.()}

<!-- WRONG — Svelte 4 slot syntax -->
<slot />
```

### useRouter vs useRoute

```typescript
const router = useRouter();           // Stable — never reactive
const { route } = useRoute();         // { current } getter — reactive, read .current
const routeName = route.current?.name; // Read .current in reactive context
```

### useRoute throws when route is undefined

`useRoute()` returns `{ navigator, route: { current: State<P> }, previousRoute: { current: State|undefined } }` —
`route.current` is **non-nullable** at the time `useRoute()` is called. The
composable throws when the router has no active state (unstarted, stopped,
disposed). `useRouteNode(name)` keeps its nullable `current` — node inactivity
is a legitimate business state, not lifecycle misuse.

```svelte
<!-- Before -->
{#if route.current}
  <p>{route.current?.name}</p>
{/if}

<!-- After -->
<p>{route.current.name}</p>
```

### Typed route params via generic

`useRoute<P>()` accepts an optional generic so `route.current.params` is typed without `as` casts. `RouteContext<P>` is likewise generic. Runtime is unchanged — the cast happens once inside the composable.

```typescript
type SearchParams = { q: string; sort: string } & Params;

const { route } = useRoute<SearchParams>();
const q = route.current.params.q; // typed as string
```

### useRouteNode Semantics

```typescript
useRouteNode("");       // Root — ALL route changes
useRouteNode("users"); // Only "users" and "users.*" routes
```

### previousRoute Is Global

```typescript
// Navigation: users.list → items → users.view
const { previousRoute } = useRouteNode("users");
previousRoute.current; // = items (not users.list!)
```

### No keepAlive

`RouteView` renders only the active snippet. On navigation, the previous component is destroyed — state is lost:

```svelte
<RouteView nodeName="">
  {#snippet users()}
    <UsersPage /> <!-- Destroyed when navigating away -->
  {/snippet}
</RouteView>
```

### activeStrict Meaning

```svelte
<!-- Current route: users.edit -->
<Link routeName="users" activeStrict={false} /> <!-- Active (ancestor) -->
<Link routeName="users" activeStrict={true} />  <!-- NOT active (not exact) -->
```

### ignoreQueryParams Default

```svelte
<!-- Default: query params don't affect active state -->
<Link routeName="users" /> <!-- Active even if ?page=2 differs -->
```

### Link Active State Is Captured At Mount

`<Link>` calls `useIsActiveRoute(routeName, routeParams, ...)` once at component
init in its `<script>` block. The underlying `createActiveRouteSource` is bound
to the **initial** prop values — Svelte 5 reactive prop changes do NOT recreate
the source.

```svelte
<!-- WRONG — swapping routeParams reactively does not update the active class -->
<script lang="ts">
  let id = $state("1");
</script>

<Link routeName="users.view" routeParams={{ id }} activeClassName="active">
  User {id}
</Link>

<button onclick={() => (id = "2")}>Switch</button>
```

After clicking "Switch", `href` correctly updates to `/users/2` (because it's
wrapped in `$derived`), but the **`active` class continues to track the
ORIGINAL `id="1"`**. Navigating to `users.view#2` will NOT light up this Link.

**Workaround — re-mount via `{#key}`:** force a fresh `<Link>` instance every
time the params change so `useIsActiveRoute` rebinds:

```svelte
{#key id}
  <Link routeName="users.view" routeParams={{ id }} activeClassName="active">
    User {id}
  </Link>
{/key}
```

Or use `{#each items as item (item.id)}` for lists — each item gets its own
Link instance keyed by `id`.

**Why this asymmetry exists:** React/Preact `<Link>` re-renders on every prop
change and re-evaluates `useIsActiveRoute` each time (memoized via
`shallowEqual`). Svelte 5 `<script>` body runs once; making `useIsActiveRoute`
reactive would require an API change (getters instead of values) or an
internal `$effect` that recreates the source on prop change. Pinned by
`tests/integration/Link.reactive-params.test.ts`.

### `<Link hash>` Prop (#532)

`hash?: string` — URL fragment (decoded, no leading `#`). Tri-state:

- `undefined` (default) — preserves the current `state.context.url.hash` on click.
- `""` — clears the hash.
- `"value"` — sets the hash; click routes through `navigateWithHash`, which auto-adds `force: true, hashChange: true` when the requested hash differs from `state.context.url.hash` on the same route+params (bypasses core's `SAME_STATES`).

```svelte
<Link routeName="settings" hash="profile">Profile</Link>
<Link routeName="settings" hash="account">Account</Link>
```

`href` is reactive via Svelte 5 `$derived` — passing a `$state` rune updates the rendered href when `hash` changes. **However**, `<Link>`'s active state is captured at mount (see "Link Active State Is Captured At Mount" gotcha above) — same-Link reactive `hash` swap does NOT update the active class. For tab-style UIs, mount one `<Link>` per tab (each with a static `hash`) rather than swapping the prop on a single Link. Hash-plugin runtime always returns `false` for hash-aware active checks.

### `target="_blank"` Is Honored on Both `<Link>` and `use:link`

Both `<Link target="_blank">` and `<a use:link target="_blank">` skip the in-app navigation and let the browser open a new tab. Earlier versions of `createLinkAction` ignored `target` — this is now consistent across both APIs.

### Snippet Name `notFound` Is Reserved in `RouteView`

`notFound` is reserved as the fallback snippet for `UNKNOWN_ROUTE`. Even if you have a literal route named `notFound` (or `notFound.detail`), the `notFound` snippet is **never** picked as a regular segment match — only as the fallback. Use a different snippet name if you need to render a route literally called `notFound`.

### `RouterErrorBoundary.onError` Throws Are Swallowed

If your `onError` callback throws, the boundary catches the error, logs it via `console.error`, and continues to render the fallback. Reactivity is not broken. This is intentional — analytics/logging code in `onError` should not be able to brick the boundary.

### createLinkAction Is a Factory — Call During Init

`createLinkAction` is a factory function that captures the router context via `getContext()`. It must be called during component initialization, not inside event handlers or `$effect`:

```svelte
<script lang="ts">
  import { createLinkAction } from "@real-router/svelte";

  // CORRECT — called during init
  const link = createLinkAction();

  // WRONG — called inside $effect
  $effect(() => {
    const link = createLinkAction(); // throws: getContext called outside component init
  });
</script>

<a use:link={{ name: "home" }}>Home</a>
```

The factory returns an action function that can be used with the `use:` directive. The action's `update()` method is called whenever the directive's value changes, so you can update route parameters reactively:

```svelte
<script lang="ts">
  import { createLinkAction } from "@real-router/svelte";

  let userId = "123";
  const link = createLinkAction();
</script>

<a use:link={{ name: "users.profile", params: { id: userId } }}>
  User {userId}
</a>

<!-- When userId changes, the action's update() is called automatically -->
```

## SSR

SSR-friendly without a separate entry. The same `RouterProvider`, `RouteView`, `Link`, and composables work under `svelte/server` (`render`) — no SSR-specific imports, no `if (typeof window !== "undefined")` shims, no platform branches in hot paths.

Verified end-to-end across three example apps:

- [`examples/web/svelte/ssr-examples/ssr/`](../../examples/web/svelte/ssr-examples/ssr) — classical `await render()` + `<svelte:head>` injection + cookie-based DI + `canActivate` guards + query params + nested loaders (~25 e2e scenarios)
- [`examples/web/svelte/ssr-examples/ssr-streaming/`](../../examples/web/svelte/ssr-examples/ssr-streaming) — RSC-like deferred-data SSR via `{#await}` blocks. **Svelte 5 stable does not stream chunked HTTP** — server ships pending UI in a single response, async resolution happens entirely on the client after hydration. ~11 e2e scenarios (cross-cutting + Svelte-specific pending-first proofs)
- [`examples/web/svelte/ssr-examples/ssg/`](../../examples/web/svelte/ssr-examples/ssg) — `getStaticPaths` + per-route meta tags + dual-mode mount (explicit `if (firstElementChild) hydrate else mount`) + 404.html + sitemap.xml (~16 e2e scenarios)

### Verified Patterns

- **`hydrate` and `mount` are different functions in Svelte 5.** `hydrate(App, { target, props })` claims existing DOM, `mount(App, { target, props })` mounts fresh. There is **no** `mount({ hydrate: true })` option in Svelte 5 — that's the deprecated Svelte 4 compat surface via `asClassComponent`. SSG dual-mode mount must branch explicitly: `if (rootElement.firstElementChild) hydrate(...) else mount(...)`
- **Do not override `resolve.conditions` in vite config.** Setting `resolve: { conditions: ["development"] }` *replaces* the Vite default condition list, which means the client build loses the implicit `"browser"` condition. svelte's `package.json` maps the `"."` export to `index-server.js` under the `default` condition — that's the SSR runtime, where `hydrate()`/`mount()` throw `lifecycle_function_unavailable`. Letting Vite supply "browser" for the client build and "node" for the SSR build is what routes `import { hydrate } from "svelte"` to the correct runtime per target. Use only `dedupe: ["svelte"]`
- **`render()` is `PromiseLike` even for sync components** — `RenderOutput = SyncRenderOutput & PromiseLike<SyncRenderOutput>`. `await render(App, { props })` covers both sync and async paths uniformly (top-level `await`, `<svelte:boundary pending>`, `{#await}` blocks)
- **`{#await}` blocks ship pending UI on the server, real content lands on the client.** Svelte 5 stable does NOT block the SSR response on `{#await}` resolution. The server emits the `{#await}` template's pending branch and returns immediately; the deferred resolution happens after hydration. This is RSC-like (server shell + client data), not React 19/Solid streaming (chunked HTTP + OOO placeholders)
- **`<svelte:head>` content lands in `RenderOutput.head`.** Components contribute declaratively to `<head>`; `render()` collects everything into the `head` field so the server splices it via `<!--ssr-head-->`. This is the alternative to manual `meta.ts` injection
- **`<Lazy>` is not for SSR data.** `<Lazy>` uses `$effect` to fire its loader, and `$effect` does not run on the server — SSR HTML contains only the fallback. For SSR-critical data, use `state.context.data` (via `ssr-data-plugin`) or top-level `await` in `<script>`
- **Snippet names `notFound` and `self` are reserved** in `RouteView` (see `RESERVED_SLOT_NAMES`). Use a different name if you need a regular route segment literally called `notFound`
- **No `browser-plugin` on the server.** Register it only in `entry-client.ts`; the server uses bare `cloneRouter(...).start(url)` with the explicit URL string

See also: [Svelte Integration — Server-Side Rendering](https://github.com/greydragon888/real-router/wiki/Svelte-Integration#server-side-rendering) for full server + client entry shapes, [Streaming SSR — Svelte Counterpart](https://github.com/greydragon888/real-router/wiki/Streaming-SSR#svelte-counterpart) for the React/Vue/Solid/Svelte streaming-model comparison, and [SSR Hydration — Same flow in Svelte 5](https://github.com/greydragon888/real-router/wiki/SSR-Hydration#same-flow-in-svelte-5) for the path-only hydration round-trip.

## Performance

- `useRouteNode` uses cached `createRouteNodeSource` from `@real-router/sources` — N consumers of the same `nodeName` share one router subscription
- `useRouterTransition` uses `getTransitionSource` — shared eager source per router
- `RouterErrorBoundary` uses `createDismissableError` — shared error source with integrated dismissal state (no local `useRouterError` composable)
- `useIsActiveRoute` uses cached `createActiveRouteSource` — params hashed via `canonicalJson` (key-order-insensitive)
- No `memo()` needed — Svelte compiles to fine-grained DOM updates
- `Link` uses `$derived` for `href` and `class` derivation, `useIsActiveRoute` for active state
- All WeakMap caches live in `@real-router/sources` — auto-evicted on router GC, no local caches in this adapter
- `EMPTY_PARAMS`, `EMPTY_OPTIONS` (frozen singletons in `src/constants.ts`) are used as default props in `Link` and as fallbacks in `createLinkAction` — avoids `{}` allocation per render / per click
- `createRouteContext` builds `route`/`previousRoute` getter objects **once** per `RouterProvider` / `useRouteNode` call — avoids the per-access object allocation of a naïve double-getter pattern
- `createSubscriber` is lazy — no subscription overhead until `.current` is read in a reactive context
