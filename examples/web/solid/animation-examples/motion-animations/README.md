# Solid Motion Animations Example

Router-coordinated route animations via [`solid-motionone`](https://github.com/solidjs-community/solid-motionone) — Solid bindings around [Motion One](https://motion.dev), the framework-agnostic engine that powers Framer Motion. `<Presence exitBeforeEnter initial={false}>` in `App.tsx` wraps a single page-level `<Motion.div>` that re-mounts via `<Show keyed>` keyed by an `exitToken` counter bumped inside `subscribeLeave`. The router blocks until the exiting Motion element fires `onMotionComplete` — URL and UI stay in lock-step, identical semantics to `route-animations/` and `page-animations/`.

This is the fourth first-class animation example in the monorepo, alongside `view-transitions/` (browser VT API), `route-animations/` (centralised hooks + manual WAAPI), and `page-animations/` (distributed per-page hook).

## Four approaches at a glance

|                                      | `view-transitions/` | `route-animations/`           | `page-animations/`                | `motion-animations/` (this)        |
| ------------------------------------ | ------------------- | ----------------------------- | --------------------------------- | ---------------------------------- |
| Mechanism                            | `document.startViewTransition` | Centralised hooks + DOM markers | Per-page `useRouteAnimation` hook | `<Presence>` from `solid-motionone` |
| Where animation logic lives          | One CSS file + policy module | Three thin hooks in `App` | Each page component               | App.tsx (~30 LOC of coordination)  |
| Router coordination                  | Promise blocks pipeline | Promise blocks pipeline   | Promise blocks pipeline           | Promise blocks pipeline (via `onMotionComplete`) |
| URL ↔ UI sync                        | Locked              | Locked                        | Locked                            | Locked                             |
| Cross-route hero morph               | Free (matching VT names) | Manual WAAPI (~110 LOC, `useHeroMorph`) | Out of scope (cross-page state) | **Not built in** — Motion One does not ship `layoutId` |
| List FLIP                            | Free                | Manual WAAPI (~230 LOC, `useListFlip`) | Local FLIP via `useListFlip` view-local hook | **Not built in** — Motion One does not ship `layout` |
| Browser support                      | Chromium 111+ / Safari 18+ / Firefox 147+ | Every browser with WAAPI | Every browser with CSS animations | Every browser with WAAPI          |
| External dependencies                | None                | None                          | None                              | `solid-motionone` (~30 KB min+gzip with Motion One) |

Pick `motion-animations/` if you want library-driven, declarative page-level entry / exit animations and prefer a small dependency over hand-rolled CSS keyframes. **Different from motion-react**: Motion One does not bundle `layoutId` (cross-component hero morph) or `<motion.li layout>` (automatic list reorder). For those scenarios in Solid, use `route-animations/`'s manual WAAPI hooks (`useHeroMorph`, `useListFlip`).

## What it covers

- **Page-level fade + slide** via `<Presence exitBeforeEnter initial={false}>` + `<Show keyed>` + `<Motion.div initial animate exit transition>` — `exitBeforeEnter` sequences exit fully before entry; `initial={false}` suppresses the first-mount animation so the heading is visible immediately on reload.
- **Reduced motion** — `solid-motionone` respects the browser's `prefers-reduced-motion` media query natively for transform animations.
- **Skip-initial / skip-same-route / abort-safety** — same router invariants as the other three examples; `useRouteExit` from `@real-router/solid` handles abort + same-route, and the `exitToken` counter never bumps when same-route is skipped, so Presence is not triggered.

## Differences from motion-react

The React equivalent (`motion` v12+) ships layout-animation primitives that solid-motionone (and Motion One generally) does **not**:

- No `layoutId` for cross-component hero morphs — paired rect transitions across route boundaries are not built in.
- No `<motion.li layout>` for automatic list reorder — sort changes do not animate by themselves.
- No `<AnimatePresence onExitComplete>` callback on the boundary — instead, listen to `onMotionComplete` on the exiting `Motion.div` and filter via an `exiting` flag (this hook does that).

For hero morph and list FLIP scenarios in Solid, the hand-rolled WAAPI approach in `route-animations/` (`useHeroMorph`, `useListFlip`) is the cross-browser, library-free path.

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

Every browser that supports the Web Animations API (`element.animate()`):

- Chrome / Edge / Opera (all current versions)
- Firefox (all current versions, including those without View Transitions)
- Safari 13.1+

For `prefers-reduced-motion`, Motion One automatically suppresses transform animations.

## How it works

```
click /about
  │
  ├─ router.subscribeLeave listener fires (via useRouteExit) →
  │     1. exiting = true; setExitToken((t) => t + 1)
  │     2. return new Promise: resolver stored in closure
  │
  ├─ Solid's reactive system runs: <Show when={exitToken() + 1} keyed>
  │   re-instantiates child because keyed value changed
  │   Presence sees the previous Motion.div is leaving:
  │     OLD Motion.div (key=N+1, with Home content cached) → exit animation queued
  │     NEW Motion.div (key=N+2) deferred (exitBeforeEnter)
  │
  ├─ exit animation plays (0.9s fade + slide-x)
  │
  ├─ OLD Motion.div fires onMotionComplete → handler resolves Promise
  │     (filter via `exiting` flag — onMotionComplete also fires for entry)
  │     router unblocks
  │
  ├─ Activation guards → setState → TRANSITION_SUCCESS
  │   browser-plugin pushes /about to history (URL updates here)
  │   Solid's reactive layer notifies → RouteView re-renders for new route
  │
  └─ Presence mounts NEW Motion.div (key=N+2) → RouteView reads route="about"
      → renders About content → entry animation plays
```

The trick: `exitToken` (not `route.name`) drives the keyed `<Show>`. Bumping the token **before** router commits causes the `<Show keyed>` re-instantiation, which Presence picks up as an exit on the cached old subtree (which still shows old route content because router state hasn't changed yet). Only when exit completes does the router commit and Solid re-renders with new content for the entering subtree.

This is router-coordinated, identical in spirit to `route-animations/` and `page-animations/` — `await router.navigate()` resolves only after the user can see the new route. URL and UI stay in lock-step.

## The infrastructure

`src/main.tsx` (~25 LOC):
- `<RouterProvider router={router}>` from `@real-router/solid`
- No router-level policy install; library does not need router-level coordination

`src/App.tsx` (~85 LOC):
- `<Presence exitBeforeEnter initial={false}>` wraps `<Show keyed>` + `<Motion.div>` + `<RouteView>`
- All routes share the same Motion.div `initial` / `animate` / `exit` props — page-level transition only

`src/use-route-exit-coordination.ts` (~75 LOC):
- `useRouteExit` returns Promise; resolver kept in closure
- `exitToken` signal bumps inside leave handler
- `onMotionComplete` filters via `exiting` flag (fires for both enter and exit)

That's the entire infrastructure. ~185 LOC.

## Known limits

- **No layoutId / layout primitives.** Motion One does not ship them. For hero morph (products → products.detail) and list reorder (sort change), see `route-animations/`'s `useHeroMorph` and `useListFlip`. The React equivalent (`motion` v12+) gives both for free; the Solid version trades that ergonomic win for a smaller library and broader compatibility.
- **Single page-level transition.** All routes share the same `Motion.div` props. For per-route customisation (different keyframes per page), drop the App-level wrapper and use `page-animations/`'s `useRouteAnimation` hook pattern.
- **Reduced-motion still blocks router on opacity exit.** Motion One suppresses transform animations under `prefers-reduced-motion`; opacity 0 → 1 still plays full duration. Router blocks for that duration. To make reduced-motion truly instant, observe the media query and reduce `transition.duration` in the handler.
