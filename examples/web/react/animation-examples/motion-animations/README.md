# React Motion Animations Example

Router-coordinated route animations via [`motion`](https://motion.dev) (formerly Framer Motion, v12+). `<AnimatePresence mode="wait">` in `App.tsx` wraps a single page-level `<motion.div>` keyed by an `exitToken` counter that bumps inside `subscribeLeave`. The router blocks until `onExitComplete` resolves the Promise — URL and UI stay in lock-step, identical semantics to `route-animations/` and `page-animations/`.

This is the fourth first-class animation example in the monorepo, alongside `view-transitions/` (browser VT API), `route-animations/` (centralised CSS-classes policy), and `page-animations/` (distributed per-page hook).

## Four approaches at a glance

|                                      | `view-transitions/` | `route-animations/`           | `page-animations/`                | `motion-animations/` (this)        |
| ------------------------------------ | ------------------- | ----------------------------- | --------------------------------- | ---------------------------------- |
| Mechanism                            | `document.startViewTransition` | Centralised policy + DOM markers | Per-page `useEffect` hook  | `<AnimatePresence>` from `motion`  |
| Where animation logic lives          | One CSS file        | One TS module                 | Each page component               | App.tsx (~30 LOC of coordination)  |
| Router coordination                  | Promise blocks pipeline | Promise blocks pipeline   | Promise blocks pipeline           | Promise blocks pipeline (via onExitComplete) |
| URL ↔ UI sync                        | Locked              | Locked                        | Locked                            | Locked                             |
| Cross-route hero morph               | Free (matching VT names) | Closure state in policy   | Needs shared state                | **Free** (`layoutId` prop)         |
| List FLIP                            | Free                | Implemented (≈80 LOC)         | Out of scope                      | **Free** (`<motion.li layout>`)    |
| Browser support                      | Chromium 111+ / Safari 18+ / Firefox 147+ | Every browser with WAAPI | Every browser with CSS animations | Every browser with WAAPI          |
| External dependencies                | None                | None                          | None                              | `motion` (~50 KB min+gzip)         |
| Smallest code for hero morph         | ~3 lines CSS        | ~40 LOC policy                | Out of scope                      | 2 props (`layoutId` × 2)           |

Pick `motion-animations/` if you want library-native ergonomics (declarative props for hero morph, list reorder, drag, gesture support) and prefer adding a polished animation library over hand-rolling DOM coordination. Same router-coordinated semantics as the other three — URL and UI stay synced.

## What it covers

- **Page-level fade + slide** via `<AnimatePresence mode="wait">` + `<motion.div key={route.name}>` — `mode="wait"` sequences exit fully before entry; `initial={false}` suppresses the first-mount animation so the heading is visible immediately on reload.
- **Hero morph (free)** — `layoutId="product-${id}"` on the thumbnail and the cover. Library caches layout info from the unmounting element and uses it as the start position for the new mount. Compare with the manual `getBoundingClientRect` + WAAPI machinery in `route-animations/animations-policy.ts`.
- **List reorder (free)** — `<motion.li layout>` runs FLIP automatically on parent re-render with reordered children. Stable `key={item.id}` is the only requirement.
- **Filter fade-in** — newly-visible items use `initial={{ opacity: 0 }}` + `animate={{ opacity: 1 }}` for entrance; library-respected `prefers-reduced-motion` collapses them to instant.
- **Reduced motion (global)** — `<MotionConfig reducedMotion="user">` in `main.tsx`. Library disables transform / layout animations site-wide while keeping opacity / backgroundColor active.
- **Skip-initial / skip-same-route / abort-safety** — same router invariants as the other three examples; AnimatePresence reacts to `key` changes, not router events directly, so SAME_STATES rejections are naturally a no-op.

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

Every browser that runs CSS animations and supports the Web Animations API (`element.animate()`):

- Chrome / Edge / Opera (all current versions)
- Firefox (all current versions, including those without View Transitions)
- Safari 13.1+

For `prefers-reduced-motion`, the library degrades transform / layout animations to instant; opacity / backgroundColor still play (this matches the platform default for "reduce" mode where complete elimination would harm UX).

## How it works

```
click /about
  │
  ├─ router.subscribeLeave listener fires →
  │     1. setExitToken((t) => t + 1)
  │     2. return new Promise: resolve stored in ref
  │
  ├─ React rerenders: motion.div key bumps from N to N+1
  │   AnimatePresence detects key change:
  │     OLD subtree (key=N, with Home content cached at render time) → exit
  │     NEW subtree (key=N+1) queued (mode="wait" defers mount)
  │
  ├─ exit animation plays (0.9s fade + slide-x)
  │
  ├─ onExitComplete fires → resolves Promise
  │     router unblocks
  │
  ├─ Activation guards → setState → TRANSITION_SUCCESS
  │   browser-plugin pushes /about to history (URL updates here)
  │   useSyncExternalStore notifies → React rerenders
  │
  └─ AnimatePresence mounts NEW (key=N+1) → RouteView reads route="about"
      → renders About content → entry animation plays
```

The trick: `exitToken` (not `route.name`) keys the `motion.div`. Bumping the token **before** router commits triggers AnimatePresence's exit on the cached old subtree (which still shows old route content because router state hasn't changed yet). Only when exit completes does the router commit and React re-render with new content for the entering subtree.

This is router-coordinated, identical in spirit to `route-animations/` and `page-animations/` — `await router.navigate()` resolves only after the user can see the new route. URL and UI stay in lock-step.

## The infrastructure

`src/main.tsx` (~28 LOC):
- `<RouterProvider router={router}>` from `@real-router/react`
- `<MotionConfig reducedMotion="user">` from `motion/react` — application-wide accessibility
- No `install*Policy(router)` call; library does not need router-level coordination

`src/App.tsx` (~70 LOC):
- `<AnimatePresence mode="wait" initial={false}>` wraps the `<RouteView>`
- Inside: a single `<motion.div key={routeName} initial animate exit transition>` — the page-level transition
- All routes share this transition; per-page customisation would live in inner motion-components (e.g. `Products.tsx`'s `<motion.li layoutId>`)

That's the entire infrastructure. ~100 LOC.

## Known limits

- **Single page-level transition.** All routes share the same `motion.div` `initial`/`animate`/`exit` props. For per-route customisation (different keyframes per page), drop the App-level wrapper and add per-page `<motion.div>` wrappers with their own `subscribeLeave` coordination — but then you lose `RouteView`'s built-in matching and have to roll your own (or use `page-animations/`'s `useRouteAnimation` hook pattern).
- **`layoutId` requires a single `<AnimatePresence>` scope.** If you nest a second one (e.g. for a modal that lives independently), `layoutId` pairs across that boundary won't be tracked. Use `<LayoutGroup id="...">` to namespace.
- **Bundle size.** `motion` adds ~50 KB min+gzip — significant for an animation example, expected if you already use the library elsewhere.
- **Reduced-motion still blocks router on opacity exit.** `MotionConfig reducedMotion="user"` suppresses transform / layout animations only; opacity 0 → 1 still plays full duration. Router blocks for that duration. To make reduced-motion truly instant, set transition `duration: 0` when `useReducedMotion()` returns true.
