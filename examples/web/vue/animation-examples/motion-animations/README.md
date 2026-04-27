# Vue Motion Animations Example

Router-coordinated route animations via [Vue's built-in `<Transition>` component](https://vuejs.org/guide/built-ins/transition.html) — first-class language feature, no external library. The `:key="exitToken"` binding on the inner `<div>` in `App.vue` triggers a key-driven remount on each token bump (set inside `useRouteExit` from `@real-router/vue`); `<Transition mode="out-in">` sequences the leave hooks before the enter hooks. The router blocks until `@after-leave` fires — URL and UI stay in lock-step, identical semantics to `route-animations/` and `page-animations/`.

This is the fourth first-class animation example in the monorepo, alongside `view-transitions/` (browser VT API), `route-animations/` (centralised composables + manual WAAPI), and `page-animations/` (distributed per-page composable).

## Four approaches at a glance

|                                      | `view-transitions/` | `route-animations/`           | `page-animations/`                | `motion-animations/` (this)        |
| ------------------------------------ | ------------------- | ----------------------------- | --------------------------------- | ---------------------------------- |
| Mechanism                            | `document.startViewTransition` | Centralised composables + DOM markers | Per-page `useRouteAnimation` composable | Vue's `<Transition>` + `:key` |
| Where animation logic lives          | One CSS file + policy module | Three thin composables in App | Each page component               | App.vue (~30 LOC of coordination)  |
| Router coordination                  | Promise blocks pipeline | Promise blocks pipeline   | Promise blocks pipeline           | Promise blocks pipeline (via `@after-leave`) |
| URL ↔ UI sync                        | Locked              | Locked                        | Locked                            | Locked                             |
| Cross-route hero morph               | Free (matching VT names) | Manual WAAPI (~110 LOC, `useHeroMorph`) | Out of scope (cross-page state) | **Not built in** — `<Transition>` is per-element |
| List FLIP                            | Free                | Manual WAAPI (~230 LOC, `useListFlip`) | Local FLIP via `useListFlip` view-local composable | Available via `<TransitionGroup>` (in-list only, not cross-route) |
| Browser support                      | Chromium 111+ / Safari 18+ / Firefox 147+ | Every browser with WAAPI | Every browser with CSS animations | Every browser with CSS transitions |
| External dependencies                | None                | None                          | None                              | None — Vue's `<Transition>` is a language feature |

Pick `motion-animations/` if you want library-free, declarative page-level entry / exit animations using Vue's first-class transition component. **Different from motion-react**: Vue does not ship `layoutId` (cross-component hero morph) or `layout` (automatic list reorder). For those scenarios in Vue, use `route-animations/`'s manual WAAPI composables.

## What it covers

- **Page-level fade + slide** via `:key="exitToken"` + `<Transition mode="out-in">` + `@after-leave="..."` + CSS class hooks. The keyed remount triggers the leave transition before the enter; the router awaits the Promise resolved on `@after-leave`.
- **Skip-initial entry** via `:appear="false"` on `<Transition>` — Vue's built-in equivalent of motion-react's `<AnimatePresence initial={false}>`.
- **Skip-same-route / abort-safety** — same router invariants as the other three examples; `useRouteExit` from `@real-router/vue` handles abort + same-route, and the `exitToken` ref never bumps when same-route is skipped, so `<Transition>` does not see a key change.

## Differences from motion-react

motion-react ships layout-animation primitives that Vue's built-in `<Transition>` does **not**:

- No `layoutId` for cross-component hero morphs — paired rect transitions across route boundaries are not built in.
- No `layout` for automatic per-element reorder. (Vue does ship `<TransitionGroup>` which uses FLIP for list reorders, but its scope is a single `<TransitionGroup>` instance — not cross-route pairing.)
- No `<AnimatePresence onExitComplete>` callback — instead, listen to `@after-leave` on `<Transition>` directly.

For hero morph and full list FLIP scenarios in Vue, the hand-rolled WAAPI approach in `route-animations/` (`useHeroMorph`, `useListFlip`) is the cross-browser, library-free path.

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

Every browser that supports CSS transitions:

- Chrome / Edge / Opera (all current versions)
- Firefox (all current versions)
- Safari (all current versions)

Vue's `<Transition>` uses CSS transitions, which honor `prefers-reduced-motion` when the CSS rules opt in (this example's `App.vue` includes a media-query block disabling transition under reduce-motion).

## How it works

```
click /about
  │
  ├─ router.subscribeLeave listener fires (via useRouteExit) →
  │     1. exitToken.value += 1
  │     2. return new Promise: resolver stored in closure
  │
  ├─ Vue's reactive system sees `:key="exitToken"` changed:
  │     OLD <div> with cached Home content → leave transition starts
  │     (.page-leave-from → .page-leave-to over 0.9s)
  │     NEW <div> mount deferred (`mode="out-in"` queues until leave done)
  │
  ├─ leave transition plays (0.9s opacity + translateX)
  │
  ├─ OLD <div> finishes → @after-leave event fires
  │     handler resolves Promise → router unblocks
  │
  ├─ Activation guards → setState → TRANSITION_SUCCESS
  │   browser-plugin pushes /about to history (URL updates here)
  │   Vue's reactive layer notifies → RouteView re-renders for new route
  │
  └─ Vue mounts NEW <div> → RouteView reads route="about"
      → renders About content → enter transition plays
      (.page-enter-from → .page-enter-to over 0.9s)
```

The trick: `exitToken` (not `route.name`) drives the keyed remount. Bumping the token **before** router commits causes the `:key` change, which Vue handles by playing the leave transition on the cached old subtree (which still shows old route content because router state hasn't changed yet). Only when `@after-leave` fires does the router commit and Vue mounts the new subtree with new content.

This is router-coordinated, identical in spirit to `route-animations/` and `page-animations/` — `await router.navigate()` resolves only after the user can see the new route. URL and UI stay in lock-step.

## The infrastructure

`src/main.ts` (~25 LOC):
- `createApp` + `mount`, wraps App in `<RouterProvider>` via `h()`
- No router-level policy install; `<Transition>` doesn't need router-level coordination

`src/App.vue` (~115 LOC):
- `<Transition name="page" mode="out-in" :appear="false" @after-leave="..."> + :key="exitToken"`
- CSS class hooks (`.page-enter-from`, `.page-leave-to`, etc.) inline in `<style>` block
- Reduced-motion media query disables transitions

`src/use-route-exit-coordination.ts` (~75 LOC):
- `useRouteExit` returns Promise; resolver kept in closure
- `exitToken` is a `ref<number>(0)` — read reactively in template
- `onAfterLeave` resolves the in-flight Promise

That's the entire infrastructure. ~215 LOC.

## Known limits

- **No layoutId / layout primitives.** Vue's built-in `<Transition>` is per-element entry/exit only. For hero morph (products → products.detail) and full cross-route reorder, see `route-animations/`'s `useHeroMorph` and `useListFlip`.
- **Single page-level transition.** All routes share the same enter/leave CSS classes. For per-route customisation (different keyframes per page), drop the App-level wrapper and use `page-animations/`'s `useRouteAnimation` pattern.
- **`:key` re-instantiates the entire subtree.** Any state inside the keyed `<div>` is reset on every navigation. That's how router coordination works (we want full unmount/remount), but it means scroll position / form drafts inside the keyed block don't persist across navigation. Use a parent shell outside the keyed block for persistent state.
