# React View Transitions Example

Demonstrates browser View Transitions API integration via the `viewTransitions` prop on `RouterProvider`.

## What it covers

- `<RouterProvider viewTransitions>` — one-prop opt-in, utility coordinates `subscribeLeave` → `document.startViewTransition` → `subscribe` → deferred release
- **Basic exit → URL change → entry** — router blocks on the old-snapshot-captured phase so URL change happens under the VT freeze frame, not ahead of the animation
- **Nested routes** — `products` IS the list (no synthetic `list` child / `forwardTo`); the inner `<RouteView nodeName="products">` is wired directly in `App.tsx`, with `<RouteView.Self>` rendering `ProductsList` and `<RouteView.Match segment="detail">` swapping in `ProductDetail` (see [Nested routes](#nested-routes))
- **Hero morph** — exactly one element gets `view-transition-name: hero` via `.vt-hero-active` class toggled by `vt-policy.ts`; scales to unlimited products with a single CSS rule (see [Scope gating](#scope-gating))
- **Query-only navigation** — sort/filter change on the same route animates only the local list, not the whole page
- **Cross-route navigation** — thumbs and lists rejoin the root scope and slide together with the page (no floating frozen elements)
- **Direction-aware** — `data-nav-direction` on `<html>` flips between forward / back keyframes (popstate → back)
- **Reduced motion** — `@media (prefers-reduced-motion: reduce)` collapses animation-duration to zero
- **Feature fallback** — browsers without `document.startViewTransition` see the utility return a no-op, navigation still works
- **Abort safety** — rapid clicks cancel in-flight transitions; the `AbortSignal` from `LeaveState` releases the deferred and calls `skipTransition()` so stale VT animations do not leak

## Run

```bash
pnpm install
pnpm dev
```

## Test

```bash
pnpm build
pnpm preview &
pnpm test:e2e
```

## Browser support

- Chromium 111+
- Safari 18+ (Sep 2024)
- Firefox 147+ (Nov 2025)

Without support, the utility is a no-op — routes still swap, just without animation.

## How it works

The utility wires three touch-points:

1. **`subscribeLeave`** — fires at `LEAVE_APPROVED`, deactivation guards have passed. We call `document.startViewTransition()` here and **return a Promise** so the router awaits until the browser has captured the old DOM snapshot.
2. **Inside `updateCallback`** — the browser invokes this only after the old snapshot is captured (per CSS VT spec §7.3). We `resolveLeave()` at callback entry, unblocking the router to run activation guards and `setState`. The callback returns a `deferred` promise that the browser keeps waiting on.
3. **`subscribe`** — fires at `TRANSITION_SUCCESS`. We resolve the `deferred` via `setTimeout(0)`, which lets the framework adapter commit the new DOM first. The browser then captures the new snapshot and plays the `::view-transition-old()` / `::view-transition-new()` animations.

```
click
  │
  ├─ subscribeLeave fires → startViewTransition() → returns Promise P
  │   (router awaits P)
  │
  ├─ browser ┄┄ next rendering step ┄┄
  │       captures old DOM snapshot
  │       invokes updateCallback:
  │         ├─ resolveLeave() ─→ P resolves (router unblocks)
  │         └─ return deferred (VT waits)
  │
  ├─ router proceeds: activation guards → setState → TRANSITION_SUCCESS
  │   browser-plugin pushes new URL (under VT freeze frame)
  │   subscribe fires → setTimeout(0, resolver)
  │
  ├─ React scheduler commits new DOM (MessageChannel task)
  ├─ setTimeout(0) callback fires → resolver() → deferred resolves
  │
  └─ browser ┄┄ captures new DOM snapshot ┄┄ plays animation
```

Net effect: **exit animation** (on `::view-transition-old`) runs over the old snapshot while the DOM is being swapped underneath; **entry animation** (on `::view-transition-new`) runs over the new snapshot. The URL changes in the same frame the old snapshot is captured, so the address bar does not visibly lead the animation.

## Nested routes

`/products` and `/products/:id` share a persistent shell (`<h1>Products</h1>` + intro paragraph). The parent `products` IS the list — no synthetic `list` child, no `forwardTo`:

```ts
// routes.ts
{
  name: "products",
  path: "/products?sort",
  defaultParams: { sort: "asc" },
  children: [
    { name: "detail", path: "/:id" }, // /products/:id
  ],
}
```

The wiring lives directly in `App.tsx` — no separate `Products.tsx` shell component. The inner `<RouteView nodeName="products">` is nested inline inside the outer match, with `<RouteView.Self>` for the list (rendered when the active route equals `products`) and `<RouteView.Match segment="detail">` for the detail:

```tsx
// App.tsx — inline nested RouteView for products
<RouteView.Match segment="products">
  <RouteView nodeName="products">
    <RouteView.Self><ProductsList /></RouteView.Self>
    <RouteView.Match segment="detail"><ProductDetail /></RouteView.Match>
  </RouteView>
</RouteView.Match>
```

Side benefit of dot-notation (`products.detail`): sidebar `<Link routeName="products" activeStrict={false}>` stays active on both `/products` and `/products/:id` via real-router's `areRoutesRelated("products", "products.detail") === true`. Flat siblings (`products`, `productDetail`) would lose this.

## Scope gating

A named `view-transition-name` promotes an element into its own VT group. The browser can no longer include it in a parent scope's animation — it either morphs between matching old/new pairs (hero morph) or fades standalone. That's exactly what you want _sometimes_ and what ruins the transition _otherwise_:

| Navigation                      | Target element scope should …  | Why                                                                 |
| ------------------------------- | ------------------------------- | ------------------------------------------------------------------- |
| products → products.detail      | One thumb + cover get `hero`    | Pair for FLIP-animated position + size                              |
| products → any other route      | Nothing gets a scope            | Else thumbs float statically while root slides — "glued" look       |
| Same-route sort/filter change    | Only list container gets a scope | Else thumbs do a tiny FLIP while the list fades around them         |

The utility in `shared/dom-utils/view-transitions.ts` is policy-free — it doesn't know which navigations are hero morphs or which element is the target. That's app-level logic.

This example extracts the policy into [`src/vt-policy.ts`](./src/vt-policy.ts) as `installViewTransitionPolicy(router)`, called once from `main.tsx`:

```ts
// main.tsx — just the wiring
installViewTransitionPolicy(router);
await router.start();
```

The policy hooks `router.subscribeLeave` + `router.subscribe` and writes classes / data attributes on `<html>` that the stylesheet consumes:

| Signal on `<html>`     | When                                                          | CSS rule reads it                     |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------- |
| `data-nav-direction`   | Toggled "back" after popstate, "forward" otherwise             | Direction-aware slide keyframes       |
| `class="vt-query-only"` | Set when `route.name === nextRoute.name` (same-route nav)     | Suppresses root-scope animation       |
| `class="vt-hero-morph"` | Set when `products ↔ products.detail`                          | Softens root to non-slide crossfade   |
| `data-vt-hero-id`       | The id of the morphing product                                 | Bookkeeping                           |

Plus one JS action: `.vt-hero-active` class is toggled on **exactly one element per hero-morph** — the source thumb in `subscribeLeave` (old DOM), then the destination cover in `router.subscribe` after `setTimeout(0)` (new DOM, post-React-commit). The stylesheet promotes that element to a shared name:

```css
/* One CSS rule, scales to any number of products. */
.vt-hero-active {
  view-transition-name: hero;
}

/* The single group animation rule, no per-id duplication. */
::view-transition-group(hero) {
  animation-duration: var(--vt-duration-hero);
  animation-timing-function: var(--vt-easing-hero);
}

/* Query-only: kill root curtain, only local scopes animate. */
html.vt-query-only::view-transition-old(root),
html.vt-query-only::view-transition-new(root) {
  animation: none !important;
}

/* Cross-route: keep list in root so it slides with the page. */
html:not(.vt-query-only) .vt-product-list,
html:not(.vt-query-only) .vt-qd-list {
  view-transition-name: none;
}
```

**Scaling property.** Elements carry `data-product-id={id}` — a stable identifier that `vt-policy.ts` uses to find the target by `querySelector('[data-product-id="<id>"]')`. Adding more products requires zero CSS changes; the single `.vt-hero-active` rule and the single `::view-transition-group(hero)` rule both remain unchanged.

**Pattern for your app:** extract the policy into its own module, gate CSS on classes emitted by the policy, identify morph targets by a stable `data-*` attribute. The utility stays generic; the demo-specific logic lives in one reusable place.

## Why `setTimeout(0)` and not `requestAnimationFrame`

This is load-bearing and non-obvious. Once `updateCallback` has been invoked, the VT enters the `update-callback-called` phase, during which Chromium sets **rendering suppression** on the document. That suppression blocks not only layout and paint but also `requestAnimationFrame` callbacks — an rAF scheduled inside `router.subscribe` would never fire. The browser would wait on the deferred, the deferred would wait on rAF, rAF would wait on the frame, and the frame is suspended. After 4 seconds Chromium gives up and rejects `vt.ready` with `TimeoutError: Transition was aborted because of timeout in DOM update`.

`setTimeout` runs on the task queue independent of the rendering pipeline, so it fires regardless of suppression. React's scheduler uses `MessageChannel` tasks, which are queued before our `setTimeout`, so the new DOM has been committed by the time our callback runs. VT then proceeds to capture the new snapshot on the next rendering opportunity.

The fire-and-forget design the utility replaces could use rAF because `router.subscribe` and rAF both ran **before** VT transitioned into `update-callback-called` — no suppression in effect. With promisified coordination, the subscribe-listener fires _inside_ the suppression window, so rAF is unusable.

## Known limits

- **Clicks feel blocked during long root-scope animations.** While a VT plays, the document is under `rendering suppression` (CSS VT L1 §4) — real DOM is not painted and is not in the hit-test tree. Only the `::view-transition` pseudo stack is hit-testable. With the root scope capturing the whole viewport (as in this demo's 2400 ms root animation), there is nothing underneath to hit, so clicks land on the overlay and don't reach Links. `pointer-events: none` on `::view-transition` works only for **scoped** transitions (where part of the page stays outside the captured scope); for root-scope animations the block is unavoidable. **Fix in production: keep VT durations under ~400 ms.** At that length the block is imperceptible. This demo intentionally runs long so each phase is clearly visible. See the *About* page for the full explanation.
- **One VT per document.** Mounting two `<RouterProvider>` instances with the same router on the same page is unsupported — both utilities would call `startViewTransition` and the second would auto-skip the first (spec-mandated).
- **Concurrent start-of-transition and abort.** If a navigation is cancelled before the browser has invoked `updateCallback`, our abort handler calls `skipTransition()` and resolves the deferred; VT winds down cleanly. This is covered by unit tests.
- **The VT API does not expose a "new snapshot captured" hook.** The spec only gives `updateCallbackDone` / `ready` / `finished`, and none of them is useful for a pre-animation router coordination point — the utility relies solely on the **entry** of `updateCallback` (guaranteed by spec to happen after old-state capture) plus the framework's own DOM commit via the task queue.
