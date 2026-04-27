# Angular Page Animations Example

Distributed per-page route-animation recipe: each page mounts the
`installRouteAnimation(() => ref, { entryClass, exitClass })` hook in its own component, which subscribes to `router.subscribeLeave` / `router.subscribe` (via `injectRouteExit` / `injectRouteEnter` from `@real-router/angular`) for as long as the page is mounted. The hook is route-agnostic — pages declare their own class names.

This is the third first-class animation example in the monorepo, alongside `view-transitions/` (browser VT API), `route-animations/` (centralised factories), and `motion-animations/` (library-free via Angular's signal system + CSS keyframes).

## Four approaches at a glance

|                                        | `view-transitions/`        | `route-animations/`              | `page-animations/` (this)           | `motion-animations/`               |
| -------------------------------------- | -------------------------- | -------------------------------- | ----------------------------------- | ---------------------------------- |
| Mechanism                              | `document.startViewTransition` | Centralised factories + DOM markers | Per-page `installRouteAnimation` factory | Signal-driven CSS classes via `injectRouteExit` |
| Router coordination                    | Promise blocks pipeline    | Promise blocks pipeline          | Promise blocks pipeline             | Promise blocks pipeline (via `@after-leave`) |
| Where animation logic lives            | One CSS file               | Three thin factories in AppComponent | Each page component             | TransitionHost.component.ts (~110 LOC) |
| Boilerplate per new route              | None (CSS only)            | Add `data-route-root` attribute  | Add `ref()` + `installRouteAnimation` call | None (single page-level transition) |
| Cross-route hero morph                 | Free (matching VT names)   | Manual WAAPI (`installHeroMorph`)    | Out of scope (cross-page state)     | Not built in (per-element transitions) |
| List FLIP with ghost exits             | Free                       | Implemented (`installListFlip`)      | Local FLIP via view-local factory | Not built in (per-element transitions) |
| Persistent-shell crossfade             | Free                       | Achievable via marker placement  | Out of scope (no nested shell)      | Out of scope                       |
| External dependency                    | None                       | None                             | None                                | None — pure Angular signals + CSS |
| Browser support                        | Chromium 111+ / Safari 18+ / Firefox 147+ | Every browser with WAAPI | Every browser with CSS animations + WAAPI | Every browser with WAAPI    |

Pick `page-animations/` if your animations are entry / exit per page with no cross-route coordination, and you prefer animation logic next to the page that owns it.

## What it covers

- **Per-page distribution**: each page subscribes to the router from its own `injectRouteExit` + `injectRouteEnter` (called inside `installRouteAnimation`). Subscriptions are torn down when the page unmounts via `DestroyRef` (registered automatically inside the adapter hooks) and re-registered when it mounts.
- **Entry + exit per page**: `subscribeLeave` returns a `Promise` that resolves when `Element.getAnimations() + .finished` settles; the router awaits it. `injectRouteEnter` adds the entry class on nav-driven mount.
- **Per-page choice**: `Products` uses slide-in / slide-out, everything else fades. The hook does not care — pages pass their own class names.
- **`skipSameRoute` guard**: query-only navigations (sort / filter on the same route) skip the animation. Without this, every filter click would re-fade the whole page.
- **Skip-initial entry**: `injectRouteEnter` requires a `previousRoute` in its context, so initial-load mounts do not trigger entry animations. Reload shows pages immediately.
- **Reduced-motion fast-path**: `Promise.allSettled([])` resolves synchronously when `getAnimations()` returns `[]` (which happens under `prefers-reduced-motion: reduce` because keyframes collapse to `animation: none`).
- **List FLIP via view-local hook**: `installListFlip` runs `$effect` driven by `useRoute()` to capture / animate position changes on sort / filter same-route navigations. Survivors translate, newcomers fade in, removed items fade out via `outerHTML`-reconstructed ghosts pinned at their last-known rect.

## What it does NOT cover

- **Hero morph between pages**: source rect is captured in page A's hook, but page B's hook has no access to that closure. Bridging requires module-level state or a custom event bus. See `route-animations/`'s `installHeroMorph` for that pattern.
- **Persistent-shell static regions**: routes here are flat-leaf precisely to avoid the false-positive case where a parent shell's listener would fire on a nested-route navigation.

For cross-page coordination, use `route-animations/` (centralised hooks) or `view-transitions/` (browser API).

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

## How it works

```
click /about
  │
  ├─ router.subscribeLeave fires (via Home's installRouteAnimation -> useRouteExit) →
  │   Home's leave handler:
  │     1. ref().classList.add('fade-out')
  │     2. ref().getBoundingClientRect()  (force style flush — see below)
  │     3. return Promise.allSettled(getAnimations().map(a => a.finished))
  │
  ├─ router awaits Home's Promise → CSS @keyframes plays on Home's wrapper
  │
  ├─ all wrapper animations finish → Promise resolves → router unblocks
  │
  ├─ Activation guards → setState → TRANSITION_SUCCESS
  │
  ├─ Home unmounts (DestroyRef tears down injectRouteExit subscription),
  │   About mounts
  │
  └─ About's useRouteEnter handler fires (skip-initial: only because
     previousRoute is defined this time) →
      1. ref().classList.add('fade-in')
      2. animationend (filtered to event.target === wrapper) → remove class
```

**Entry plays on `injectRouteEnter`, not on `router.subscribe`.** The subscribe path has a fundamental race in the distributed model: `router.subscribe` fires synchronously when the router commits the new state, but the new page's constructor runs before Angular commits the new DOM — strictly later. The subscribe event arrives before any subscriber on the new page exists, so an entry animation wired through `router.subscribe` would never play. `injectRouteEnter` from `@real-router/angular` resolves this via Angular's signal system: it reads the post-commit `route` snapshot through Angular's effect and dispatches the handler with mount-time `route` / `previousRoute` once Angular's signal effect flushes. Skip-initial is built in.

**`element.getBoundingClientRect()` after `classList.add`.** Browsers lazily compute style. A class added then quickly observed (or removed by something else) without an intervening style read can have its animation skipped entirely — `getAnimations()` returns `[]` and our Promise resolves at once, the router commits without waiting. Reading `getBoundingClientRect()` is the canonical no-op trigger that forces style recalc, guaranteeing the animation is actually registered before we await it.

**Why `getAnimations()` instead of `animationend`.** `animationend` bubbles up from descendants — `shared/styles.css` has a `fadeIn` keyframe on `a.active`, for example, and link clicks fire animationend events that would resolve our exit Promise prematurely. `Element.getAnimations()` is scoped to that element only.

## The hook

`src/use-route-animation.ts` (~120 LOC). Two parts:

1. **Entry** via `injectRouteEnter` from `@real-router/angular`. Fires once on nav-driven mount (skip-initial built in). Adds the entry class, attaches an `animationend` listener filtered to events whose target is the wrapper itself, removes the class when the wrapper's animation finishes.
2. **Exit** via `injectRouteExit` from `@real-router/angular`. Returns a Promise the router awaits. Uses `Element.getAnimations()` + `.finished` (scoped to the element) plus `getBoundingClientRect()` to force style flush so the animation is actually registered before we wait on it. Same-route skip via `skipSameRoute` option.

## Angular pattern

Pages use `inject(ElementRef)` in their constructor and pass the host element to the factory:

```ts
import { Component, ElementRef, inject } from "@angular/core";
import { installRouteAnimation } from "../route-animation";

@Component({
  selector: "home-page",
  template: `<h1>Home</h1>...`,
})
export class HomeComponent {
  constructor() {
    const hostRef = inject(ElementRef<HTMLElement>);
    installRouteAnimation(hostRef, {
      entryClass: "fade-in",
      exitClass: "fade-out",
    });
  }
}
```

The factory accepts an `ElementRef<HTMLElement>` directly. It reads `hostRef.nativeElement` inside the handler at exit / enter time. The host element of the component **is** the animated wrapper — no inner div needed.

## Known limits

- **Entry plays even if a page navigates back to itself.** Mount triggers entry; if you have a `keepAlive` setup that keeps the page mounted across navigations, entry would not replay (because there's no remount). The current flat-routes setup never hits this — every navigation away unmounts.
- **Two pages mounted at once** (e.g. layout that renders multiple `RouteView`s) means each animates independently — both fade out on leave, both fade in on mount. Either dedupe via component composition or fall back to `route-animations/` (centralised) for that scope.
- **No cross-route coordination.** Hero morph requires shared state outside the hook. See `route-animations/`'s `installHeroMorph` for the cross-component recipe in Angular.
