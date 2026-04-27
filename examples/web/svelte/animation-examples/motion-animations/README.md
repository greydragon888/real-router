# Svelte Motion Animations Example

Router-coordinated route animations via [Svelte's built-in `transition:` directives](https://svelte.dev/docs/svelte/transition) — first-class language features, no external library. The `{#key exitToken.current}` block in `TransitionHost.svelte` wraps a single page-level `<div>` with `in:fly` / `out:fly` transitions; the key changes inside `useRouteExit` (from `@real-router/svelte`), re-instantiating the block. The router blocks until the element's `onoutroend` fires — URL and UI stay in lock-step, identical semantics to `route-animations/` and `page-animations/`.

This is the fourth first-class animation example in the monorepo, alongside `view-transitions/` (browser VT API), `route-animations/` (centralised composables + manual WAAPI), and `page-animations/` (distributed per-page composable).

## Four approaches at a glance

|                                      | `view-transitions/` | `route-animations/`           | `page-animations/`                | `motion-animations/` (this)        |
| ------------------------------------ | ------------------- | ----------------------------- | --------------------------------- | ---------------------------------- |
| Mechanism                            | `document.startViewTransition` | Centralised composables + DOM markers | Per-page `useRouteAnimation` composable | Svelte's `transition:fly` + `{#key}` |
| Where animation logic lives          | One CSS file + policy module | Three thin composables in inner host | Each page component | TransitionHost.svelte (~30 LOC of coordination) |
| Router coordination                  | Promise blocks pipeline | Promise blocks pipeline   | Promise blocks pipeline           | Promise blocks pipeline (via `onoutroend`) |
| URL ↔ UI sync                        | Locked              | Locked                        | Locked                            | Locked                             |
| Cross-route hero morph               | Free (matching VT names) | Manual WAAPI (~110 LOC, `useHeroMorph`) | Out of scope (cross-page state) | **Not built in** — Svelte transitions are per-element |
| List FLIP                            | Free                | Manual WAAPI (~230 LOC, `useListFlip`) | Local FLIP via `useListFlip` view-local hook | **Not built in** — same reason |
| Browser support                      | Chromium 111+ / Safari 18+ / Firefox 147+ | Every browser with WAAPI | Every browser with CSS animations | Every browser with WAAPI          |
| External dependencies                | None                | None                          | None                              | None — Svelte's transitions are language features |

Pick `motion-animations/` if you want library-free, declarative page-level entry / exit animations using Svelte's first-class transition directives. **Different from motion-react**: Svelte does not bundle `layoutId` (cross-component hero morph) or `layout` (automatic list reorder). For those scenarios in Svelte, use `route-animations/`'s manual WAAPI composables.

## What it covers

- **Page-level fade + slide** via `{#key exitToken.current}` + `<div in:fly={...} out:fly={...} onoutroend={...}>` — the keyed block re-instantiates on token change, triggering the out transition before the in. Sequential by Svelte's transition semantics; the router awaits the Promise resolved on `onoutroend`.
- **Skip-initial entry** via a first-mount `$state` flag that zeroes the in-fly duration on the very first instantiation. Equivalent to motion-react's `<AnimatePresence initial={false}>`.
- **Skip-same-route / abort-safety** — same router invariants as the other three examples; `useRouteExit` from `@real-router/svelte` handles abort + same-route, and the `exitToken` counter never bumps when same-route is skipped, so `{#key}` does not re-instantiate.

## Differences from motion-react

motion-react ships layout-animation primitives that Svelte's built-in transitions do **not**:

- No `layoutId` for cross-component hero morphs — paired rect transitions across route boundaries are not built in.
- No `<motion.li layout>` for automatic list reorder — sort changes do not animate by themselves.
- No `<AnimatePresence onExitComplete>` boundary callback — instead, listen to `onoutroend` on the exiting element directly.

For hero morph and list FLIP scenarios in Svelte, the hand-rolled WAAPI approach in `route-animations/` (`useHeroMorph`, `useListFlip`) is the cross-browser, library-free path.

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

Svelte's `fly` transition uses transform + opacity, both honor `prefers-reduced-motion` when paired with the `reducedMotion` parameter or via custom transition functions.

## How it works

```
click /about
  │
  ├─ router.subscribeLeave listener fires (via useRouteExit) →
  │     1. exitToken.current += 1
  │     2. return new Promise: resolver stored in closure
  │
  ├─ Svelte's reactive system sees the keyed value changed:
  │   `{#key exitToken.current}` re-instantiates its block
  │     OLD <div> with cached Home content → out:fly transition starts
  │     NEW <div> mount deferred (Svelte queues until out completes)
  │
  ├─ out:fly animation plays (0.9s slide-x left + opacity fade)
  │
  ├─ OLD <div>'s onoutroend fires → handler resolves Promise
  │     router unblocks
  │
  ├─ Activation guards → setState → TRANSITION_SUCCESS
  │   browser-plugin pushes /about to history (URL updates here)
  │   Svelte's reactive layer notifies → RouteView re-renders for new route
  │
  └─ Svelte mounts NEW <div> → RouteView reads route="about"
      → renders About content → in:fly transition plays
```

The trick: `exitToken.current` (not `route.name`) drives the keyed block. Bumping the token **before** router commits causes the `{#key}` re-instantiation, which Svelte handles by playing the out transition on the cached old subtree (which still shows old route content because router state hasn't changed yet). Only when out completes does the router commit and Svelte mounts the new subtree with new content.

This is router-coordinated, identical in spirit to `route-animations/` and `page-animations/` — `await router.navigate()` resolves only after the user can see the new route. URL and UI stay in lock-step.

## The infrastructure

`src/main.ts` (~25 LOC):
- `mount(App, ...)` from Svelte 5
- No router-level policy install; transitions don't need router-level coordination

`src/App.svelte` (~25 LOC):
- `<RouterProvider>` + `<Layout>` + `<TransitionHost>`

`src/TransitionHost.svelte` (~75 LOC):
- `{#key exitToken.current}` wraps the Motion `<div>` + `<RouteView>`
- `in:fly` and `out:fly` transitions; `onoutroend` resolves the router Promise
- First-mount flag suppresses initial entry animation

`src/use-route-exit-coordination.svelte.ts` (~75 LOC):
- `useRouteExit` returns Promise; resolver kept in closure
- `exitToken` is a `$state({ current: 0 })` — single-property reactive state
- `onOutroEnd` resolves the in-flight Promise

That's the entire infrastructure. ~200 LOC.

## Known limits

- **No layoutId / layout primitives.** Svelte's built-in transitions are per-element entry/exit only. For hero morph (products → products.detail) and list reorder (sort change), see `route-animations/`'s `useHeroMorph` and `useListFlip`.
- **Single page-level transition.** The host applies one `in:fly` / `out:fly` to all routes. For per-route customisation (different keyframes per page), drop the App-level wrapper and use `page-animations/`'s `useRouteAnimation` pattern.
- **`{#key}` re-instantiates the entire subtree.** Any state inside the host's children is reset on every navigation. That's how router coordination works (we want full unmount/remount), but it means scroll position / form drafts inside the host don't persist across navigation. Use a parent shell outside the keyed block for persistent state.
