# Angular Motion Animations Example

Router-coordinated route animations via Angular's signal system + plain CSS keyframes — no external library, no `@angular/animations` trigger DSL. The `TransitionHost` component owns a wrapper `<div class="page">`; `injectRouteExit` from `@real-router/angular` adds `.leaving` class via direct DOM manipulation, awaits `Element.getAnimations() + .finished`, then removes the class. After the router commits, `injectRouteEnter` adds `.entering`; `(animationend)` strips it. URL and UI stay in lock-step, identical semantics to `route-animations/` and `page-animations/`.

This is the fourth first-class animation example in the monorepo, alongside `view-transitions/` (browser VT API), `route-animations/` (centralised factories), and `page-animations/` (distributed per-page factory).

## Four approaches at a glance

|                                      | `view-transitions/` | `route-animations/`           | `page-animations/`                | `motion-animations/` (this)        |
| ------------------------------------ | ------------------- | ----------------------------- | --------------------------------- | ---------------------------------- |
| Mechanism                            | `document.startViewTransition` | Centralised factories + DOM markers | Per-page `installRouteAnimation` factory | Signal-driven CSS classes via `injectRouteExit` |
| Where animation logic lives          | One CSS file + policy module | Three thin factories in App | Each page component               | TransitionHost.component.ts (~110 LOC) |
| Router coordination                  | Promise blocks pipeline | Promise blocks pipeline   | Promise blocks pipeline           | Promise blocks pipeline (via `getAnimations() + .finished`) |
| URL ↔ UI sync                        | Locked              | Locked                        | Locked                            | Locked                             |
| Cross-route hero morph               | Free (matching VT names) | Manual WAAPI (~110 LOC, `installHeroMorph`) | Out of scope (cross-page state) | **Not built in** — page wrapper is per-element |
| List FLIP                            | Free                | Manual WAAPI (~230 LOC, `installListFlip`) | Local FLIP via `installListFlip` view-local factory | Out of scope (use `route-animations/` or `page-animations/`) |
| Browser support                      | Chromium 111+ / Safari 18+ / Firefox 147+ | Every browser with WAAPI | Every browser with CSS animations | Every browser with CSS animations |
| External dependencies                | None                | None                          | None                              | None — pure Angular signals + CSS |

Pick `motion-animations/` if you want library-free, declarative page-level entry / exit animations using a single signal-bound class state. **Different from motion-react**: Angular has no built-in `layoutId` (cross-component hero morph) or `layout` (automatic list reorder). For those scenarios in Angular, use `route-animations/`'s manual WAAPI factories.

## What it covers

- **Page-level fade + slide** via `.leaving` / `.entering` CSS classes on the page wrapper. The wrapper is mounted once at `transition-host` init and never unmounts; only its inner `<route-view>` re-renders when the router commits.
- **Skip-initial entry** — the wrapper starts in the no-class default ("active") state. `injectRouteEnter` only fires on nav-driven mount (`route.transition.from` is set), so the very first load shows content without an animation.
- **Skip-same-route / abort-safety** — same router invariants as the other three examples; `injectRouteExit` from `@real-router/angular` handles abort + same-route. `injectRouteEnter` shares the same `skipSameRoute` default.

## Differences from motion-react

motion-react ships layout-animation primitives that the Angular CSS-class approach does **not**:

- No `layoutId` for cross-component hero morphs — paired rect transitions across route boundaries are not built in.
- No `layout` for automatic per-element reorder — list FLIP is not handled by the page-level wrapper.
- No `<AnimatePresence onExitComplete>` callback — instead, the leave Promise resolves when `Element.getAnimations() + .finished` settle.

For hero morph and full list FLIP scenarios in Angular, the hand-rolled WAAPI approach in `route-animations/` (`installHeroMorph`, `installListFlip`) is the cross-browser, library-free path.

## Why direct `classList` instead of `[class.leaving]="phase()"`

Angular signals commit asynchronously through the change-detection cycle, but `injectRouteExit`'s handler runs **synchronously** inside the leave window. If the handler wrote to a `phase` signal and immediately queried `getAnimations()`, the query would return `[]` because Angular has not yet applied the class to the DOM — the router would unblock with no animation visible. `classList.add` is synchronous, so the keyframe is registered in the same task and `getAnimations()` finds it.

This is the same reason `installRouteAnimation` (in `page-animations/`) and `installPageAnimator` (in `route-animations/`) write directly to `classList`. The trade-off: lose the declarative-template feel for predictable timing.

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
- Safari (all current versions)

Reduced-motion respect is via `@media (prefers-reduced-motion: reduce)` collapsing the keyframes to `animation: none`. `getAnimations()` returns `[]`, so `Promise.allSettled([])` in `TransitionHost` resolves synchronously — the router never blocks.

## How it works

```
click /about
  │
  ├─ router.subscribeLeave fires (via injectRouteExit) →
  │   1. wrapper.classList.add('leaving') (synchronous DOM write)
  │   2. wrapper.getBoundingClientRect() (style flush)
  │   3. await Promise.allSettled(getAnimations().map(a => a.finished))
  │
  ├─ CSS @keyframes page-leave plays on .page.leaving (0.9s)
  │
  ├─ animation finishes → Promise resolves → router unblocks
  │
  ├─ Activation guards run → setState → TRANSITION_SUCCESS
  │
  ├─ Angular re-renders <route-view> with the new active route
  │
  ├─ injectRouteEnter fires →
  │   1. wrapper.classList.add('entering')
  │
  ├─ CSS @keyframes page-enter plays on .page.entering (0.9s)
  │
  └─ animationend fires → wrapper.classList.remove('entering')
```

The wrapper itself never unmounts. Only its inner `<route-view>` re-renders when the router commits — same pattern as Vue's `<Transition>` keyed remount, but accomplished via DOM manipulation on a stable element rather than `:key`-driven re-instantiation.

This is router-coordinated, identical in spirit to `route-animations/` and `page-animations/` — `await router.navigate()` resolves only after the user can see the new route. URL and UI stay in lock-step.

## The infrastructure

`src/main.ts` (~25 LOC):
- `bootstrapApplication` from `@angular/platform-browser`
- `provideRealRouter(router)` from `@real-router/angular`
- No router-level policy install; the wrapper-level coordination lives inside `TransitionHost`

`src/transition-host.component.ts` (~110 LOC):
- A standalone component that wraps `<route-view>` in a single `<div class="page">`
- `injectRouteExit` synchronously adds `.leaving`, then awaits `getAnimations()`
- `injectRouteEnter` synchronously adds `.entering`
- `(animationend)` removes `.entering`

`src/styles/animations.css` (~50 LOC):
- `@keyframes page-leave` (opacity 1→0, translateX 0→-20px)
- `@keyframes page-enter` (opacity 0→1, translateX 20px→0)
- `@media (prefers-reduced-motion: reduce)` collapses both to `animation: none`

That's the entire infrastructure. ~185 LOC.

## Known limits

- **No layoutId / layout primitives.** The page wrapper's CSS keyframes are per-element entry/exit only. For hero morph (products → products.detail) and full cross-route reorder, see `route-animations/`'s `installHeroMorph` and `installListFlip`.
- **Single page-level animation.** All routes share the same enter/leave keyframes. For per-route customisation (different keyframes per page), drop the wrapper and use `page-animations/`'s `installRouteAnimation` pattern.
- **Wrapper persists across navigations.** That's intentional — the `.leaving` / `.entering` class state must persist across the router commit boundary so the entry animation can play after the new content mounts.
