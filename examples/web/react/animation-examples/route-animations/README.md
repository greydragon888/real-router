# React Route Animations Example

Demonstrates route animations via CSS `@keyframes` + an async `subscribeLeave` listener — no View Transitions API. Parallel to the sibling `view-transitions/` example: same UI, different mechanism.

## Four approaches at a glance

|                                       | `view-transitions/`                            | `route-animations/` (this)                       | `page-animations/`                  | `motion-animations/`               |
| ------------------------------------- | ---------------------------------------------- | ------------------------------------------------ | ----------------------------------- | ---------------------------------- |
| Mechanism                             | `document.startViewTransition()` + VT pseudos  | `subscribeLeave` returns Promise + `@keyframes`  | Per-page `useEffect` hook            | `<AnimatePresence>` from `motion`  |
| Router coordination                   | Promise blocks pipeline                        | Promise blocks pipeline                          | Promise blocks pipeline             | Promise blocks pipeline (via onExitComplete) |
| Browser support                       | Chromium 111+, Safari 18+, Firefox 147+        | All browsers with CSS animations                 | All browsers with CSS animations    | All browsers with WAAPI            |
| Exit / entry timing                   | Always parallel crossfade                      | Sequential by default (router blocks on Promise) | Sequential per page                 | Sequential (`mode="wait"`)         |
| Per-route customisation               | Free via `view-transition-name` per scope      | Free via `data-route-anim` attribute             | Per-page class names                | Single page-level transition       |
| Hero morph (FLIP between routes)      | Free via matching `view-transition-name` pairs | Manual via `getBoundingClientRect` + WAAPI       | Out of scope (cross-page state)     | Free via `layoutId` prop           |
| List FLIP with ghost exits            | Free                                           | Implemented (≈80 LOC)                            | Out of scope                        | Free via `<motion.li layout>`      |
| Persistent shell crossfade            | Free (pixel-level snapshot diff)               | Granular `[data-route-root]` placement           | Out of scope (no shell)             | Out of scope (no shell)            |
| Rendering suppression during playback | Yes — clicks land on overlay                   | None — DOM stays interactive                     | None                                | None                               |
| External dependency                   | None                                           | None                                             | None                                | `motion` (~50 KB min+gzip)         |
| Code size                             | ~30 LOC utility + ~120 LOC policy              | ~30 LOC helper + ~250 LOC policy                 | ~80 LOC hook + per-page useEffect   | ~100 LOC App + inner motion props  |

Pick `route-animations/` if you need Firefox 145- support, custom timing per route, full router coordination (URL + UI in lock-step), and the most control over choreography. The other three trade some of that for simpler code or library ergonomics.

## What it covers

- **Async `subscribeLeave`** — listener returns `Promise<void>`, the router blocks on it until `animationend` fires (or 50 ms fallback timeout for `prefers-reduced-motion`)
- **Per-route timing** — Home / About / QueryDemo fade (900 ms), ProductsList slides direction-aware (2100 ms), ProductDetail uses background fade + WAAPI hero-FLIP (1800 ms / 2400 ms). Durations are intentionally long for pedagogical clarity — for production, scale them down to ~250–500 ms
- **Direction-aware** — `data-nav-direction` on `<html>` flips between forward / back keyframes (popstate → back)
- **Skip-initial / skip-same-route** — `router.start()` does not fire `subscribeLeave`; `SAME_STATES` for clicks on the active link short-circuits before listeners run
- **Query-only suppression** — sort/filter changes (`route.name === nextRoute.name`) skip the leave marker so the page does not fade for an in-place re-sort
- **List reorder FLIP** — sort / filter on the same route runs three coordinated WAAPI animations: survivors translate from old to new position, newly-visible items fade in, and items removed by a narrowing filter fade out via `cloneNode` ghosts pinned at their old rect (React unmounts the originals before subscribe fires, so the recipe keeps offscreen copies)
- **Manual hero-FLIP** — thumb rect captured before leave + inverse-FLIP transform via Web Animations API after destination commits. The recipe pays ~30 LOC of policy code for what View Transitions does in two CSS rules
- **Abort safety** — rapid clicks fire `signal.abort` from `LeaveState`; cleanup removes `data-leaving` from cancelled exits
- **Reduced motion** — `@media (prefers-reduced-motion: reduce)` collapses keyframes to `animation: none`; 50 ms `Promise.race` fallback unblocks the router

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

Every browser that runs CSS animations and supports the Web Animations API (`element.animate()`) for the hero-FLIP path:

- Chrome / Edge / Opera (all current versions)
- Firefox (all current versions — including those without View Transitions)
- Safari 13.1+ (WAAPI shipped in March 2020)

For `prefers-reduced-motion`, the recipe degrades to instant swaps via the 50 ms timeout.

## How it works

```
click
  │
  ├─ router.subscribeLeave fires →
  │     1. Set data-nav-direction on <html> (popstate-aware)
  │     2. Same-route check → skip animation, return synchronously
  │     3. Hero-morph check → capture sourceRect via getBoundingClientRect
  │     4. Find [data-route-root] on the active leaf, set data-leaving="true"
  │     5. Return animateExit(target) — a Promise<void>
  │
  ├─ router.subscribeLeave Promise pending → router blocks
  │
  ├─ CSS @keyframes plays on [data-route-anim="…"][data-leaving]
  │     (900–2100 ms depending on route)
  │
  ├─ animationend fires → animateExit Promise resolves → router unblocks
  │
  ├─ Activation guards run → setState → TRANSITION_SUCCESS
  │
  ├─ React commits new DOM → entry @keyframe plays on
  │     [data-route-anim="…"]:not([data-leaving])
  │
  └─ For hero-morph only: subscribe + setTimeout(0) →
        measure destRect → compute delta → element.animate([…])
```

The recipe relies on three router behaviours and two CSS conventions:

| Layer  | Element                                                                |
| ------ | ---------------------------------------------------------------------- |
| Router | `subscribeLeave` listener returns Promise; router awaits with `Promise.allSettled` |
| Router | `LeaveState.signal` aborts on cancelled navigations (rapid clicks)     |
| Router | `subscribe` callback runs synchronously at TRANSITION_SUCCESS           |
| CSS    | Selectors `[data-route-anim="…"][data-leaving]` (exit) + `:not([data-leaving])` (entry, plays on mount) |
| CSS    | Direction-aware via `html[data-nav-direction]` ancestor selector        |

## Nested routes

`/products` and `/products/:id` share the parent `products` route — no synthetic `list` child, no `forwardTo`. The parent IS the list:

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

The wiring lives directly in `App.tsx` — no separate `Products.tsx` shell component. **`[data-route-root]` lives on `ProductsList` and `ProductDetail` themselves**, on each leaf's outermost wrapper:

```tsx
// App.tsx
<RouteView.Match segment="products">
  <RouteView nodeName="products">
    <RouteView.Self>
      <ProductsList />         {/* has data-route-root inside */}
    </RouteView.Self>
    <RouteView.Match segment="detail">
      <ProductDetail />        {/* has data-route-root inside */}
    </RouteView.Match>
  </RouteView>
</RouteView.Match>
```

`usePageAnimator` queries `document.querySelector("[data-route-root]")` and finds exactly one match per render — the active leaf. Both `ProductsList` and `ProductDetail` mark their own outer wrapper with the attribute; on a `products` ↔ `products.detail` navigation, the marker swaps between the two leaves and the page-level fade animates each one in turn. (For a true persistent shell with a static heading, an outer wrapper without `[data-route-root]` could be added — out of scope for this example.)

This is the trade-off the recipe makes vs View Transitions, which gets persistent-shell static rendering for free via pixel-level snapshot diffing. With CSS animations, anything inside the leaving `[data-route-root]` fades, so the marker has to be placed precisely.

## Why no `setTimeout(0)` workaround

The sibling `view-transitions/` example needs `setTimeout(0)` inside its `subscribe` listener — a non-obvious detail explained at length in its README. The reason: VT enters a `update-callback-called` phase after `startViewTransition` is invoked, during which Chromium suppresses the rendering pipeline, and `requestAnimationFrame` callbacks scheduled during that window never fire.

The CSS-classes recipe has no equivalent suppression. `subscribeLeave` returns a Promise; the router is genuinely waiting on `animationend`, not on a deferred coordinated through the rendering pipeline. After `animationend` resolves, the router activates the new state synchronously, React commits, and the entry keyframe plays on the new `[data-route-root]:not([data-leaving])` element via the natural CSS animation-on-mount semantics.

The only `setTimeout(0)` in this example is in the hero-morph branch (after `subscribe` fires) — and there it is needed for the same reason `useSyncExternalStore` has commit-phase subtleties: we need to wait one task for React to commit before measuring the destination element's rect.

## Known limits

- **No true crossfade.** The recipe is sequential (exit fully → entry). Crossfade requires both DOM trees mounted simultaneously, which is a framework-adapter coordination problem the recipe does not solve. View Transitions gives crossfade for free via DOM snapshots.
- **Hero morph is manual.** Capturing source rects, applying inverse-FLIP transforms, and identifying destination elements by `data-product-id` is application-level code (~110 LOC in `useHeroMorph`). VT does this with two matching `view-transition-name` rules. The recipe trades terseness for cross-browser support.
- **List reorder is also manual.** Same trade-off as hero-morph: VT pairs items by `view-transition-name` and animates positions automatically; the recipe captures every `[data-flip-key]` rect on leave and replays inverse-FLIP transforms via the Web Animations API. Removed-item EXIT is approximated with `cloneNode` ghosts (position:fixed at the captured rect, fade + scale, then dropped) — visually convincing but the ghost is non-interactive during the fade. A library like `react-flip-toolkit` solves this with a richer state machine; the recipe's ~230 LOC is enough for the demo.
- **Mixed exit / entry timing.** Home (fade, 900 ms) → Products (slide, 2100 ms) plays a 900 ms fade-out followed by a 2100 ms slide-in. Exit timing is determined by the leaving route, entry timing by the arriving route. If you want all transitions to use a single timing pair, use a single `data-route-anim` value across all leaf routes.
- **Granular `[data-route-root]` discipline.** Forgetting the marker on a new page silently disables animation on that route. There is no central registry — wiring is by data attribute. A `console.warn` in `usePageAnimator` when the leaf has no marker would help; we leave that as a hook for users to add per-app.
