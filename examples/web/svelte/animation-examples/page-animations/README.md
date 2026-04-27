# Svelte Page Animations Example

Distributed per-page route-animation recipe: each page mounts the
`useRouteAnimation(() => ref, { entryClass, exitClass })` hook in its own component, which subscribes to `router.subscribeLeave` / `router.subscribe` (via `useRouteExit` / `useRouteEnter` from `@real-router/svelte`) for as long as the page is mounted. The hook is route-agnostic — pages declare their own class names.

This is the third first-class animation example in the monorepo, alongside `view-transitions/` (browser VT API), `route-animations/` (centralised hooks), and `motion-animations/` (library-driven via `motion-svelte`).

## Four approaches at a glance

|                                        | `view-transitions/`        | `route-animations/`              | `page-animations/` (this)           | `motion-animations/`               |
| -------------------------------------- | -------------------------- | -------------------------------- | ----------------------------------- | ---------------------------------- |
| Mechanism                              | `document.startViewTransition` | Centralised hooks + DOM markers | Per-page `useRouteAnimation` hook   | `<Presence>` from `motion-svelte` |
| Router coordination                    | Promise blocks pipeline    | Promise blocks pipeline          | Promise blocks pipeline             | Promise blocks pipeline (via `onMotionComplete`) |
| Where animation logic lives            | One CSS file               | Three thin hooks in `App`        | Each page component                 | App.tsx                            |
| Boilerplate per new route              | None (CSS only)            | Add `data-route-root` attribute  | Add `let ref` + `useRouteAnimation` call | None (single page-level transition) |
| Cross-route hero morph                 | Free (matching VT names)   | Manual WAAPI (`useHeroMorph`)    | Out of scope (cross-page state)     | Not built in (Motion One)          |
| List FLIP with ghost exits             | Free                       | Implemented (`useListFlip`)      | Local FLIP via view-local hook      | Not built in (Motion One)          |
| Persistent-shell crossfade             | Free                       | Achievable via marker placement  | Out of scope (no nested shell)      | Out of scope                       |
| External dependency                    | None                       | None                             | None                                | `motion-svelte` (~30 KB)         |
| Browser support                        | Chromium 111+ / Safari 18+ / Firefox 147+ | Every browser with WAAPI | Every browser with CSS animations + WAAPI | Every browser with WAAPI    |

Pick `page-animations/` if your animations are entry / exit per page with no cross-route coordination, and you prefer animation logic next to the page that owns it.

## What it covers

- **Per-page distribution**: each page subscribes to the router from its own `useRouteExit` + `useRouteEnter` (called inside `useRouteAnimation`). Subscriptions are torn down when the page unmounts via `onCleanup` (registered automatically inside the adapter hooks) and re-registered when it mounts.
- **Entry + exit per page**: `subscribeLeave` returns a `Promise` that resolves when `Element.getAnimations() + .finished` settles; the router awaits it. `useRouteEnter` adds the entry class on nav-driven mount.
- **Per-page choice**: `Products` uses slide-in / slide-out, everything else fades. The hook does not care — pages pass their own class names.
- **`skipSameRoute` guard**: query-only navigations (sort / filter on the same route) skip the animation. Without this, every filter click would re-fade the whole page.
- **Skip-initial entry**: `useRouteEnter` requires a `previousRoute` in its context, so initial-load mounts do not trigger entry animations. Reload shows pages immediately.
- **Reduced-motion fast-path**: `Promise.allSettled([])` resolves synchronously when `getAnimations()` returns `[]` (which happens under `prefers-reduced-motion: reduce` because keyframes collapse to `animation: none`).
- **List FLIP via view-local hook**: `useListFlip` runs `$effect` driven by `useRoute()` to capture / animate position changes on sort / filter same-route navigations. Survivors translate, newcomers fade in, removed items fade out via `outerHTML`-reconstructed ghosts pinned at their last-known rect.

## What it does NOT cover

- **Hero morph between pages**: source rect is captured in page A's hook, but page B's hook has no access to that closure. Bridging requires module-level state or a custom event bus. See `route-animations/`'s `useHeroMorph` for that pattern.
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
  ├─ router.subscribeLeave fires (via Home's useRouteAnimation -> useRouteExit) →
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
  ├─ Home unmounts (onCleanup tears down useRouteExit subscription),
  │   About mounts
  │
  └─ About's useRouteEnter handler fires (skip-initial: only because
     previousRoute is defined this time) →
      1. ref().classList.add('fade-in')
      2. animationend (filtered to event.target === wrapper) → remove class
```

**Entry plays on `useRouteEnter`, not on `router.subscribe`.** The subscribe path has a fundamental race in the distributed model: `router.subscribe` fires synchronously when the router commits the new state, but the new page's `onMount` runs after Svelte commits the new DOM — strictly later. The subscribe event arrives before any subscriber on the new page exists, so an entry animation wired through `router.subscribe` would never play. `useRouteEnter` from `@real-router/svelte` resolves this via the `useSyncExternalStore`-equivalent `createReactiveSource` bridge: it reads the post-commit snapshot and dispatches the handler with mount-time `route` / `previousRoute`. Skip-initial is built in.

**`element.getBoundingClientRect()` after `classList.add`.** Browsers lazily compute style. A class added then quickly observed (or removed by something else) without an intervening style read can have its animation skipped entirely — `getAnimations()` returns `[]` and our Promise resolves at once, the router commits without waiting. Reading `getBoundingClientRect()` is the canonical no-op trigger that forces style recalc, guaranteeing the animation is actually registered before we await it.

**Why `getAnimations()` instead of `animationend`.** `animationend` bubbles up from descendants — `shared/styles.css` has a `fadeIn` keyframe on `a.active`, for example, and link clicks fire animationend events that would resolve our exit Promise prematurely. `Element.getAnimations()` is scoped to that element only.

## The hook

`src/use-route-animation.ts` (~120 LOC). Two parts:

1. **Entry** via `useRouteEnter` from `@real-router/svelte`. Fires once on nav-driven mount (skip-initial built in). Adds the entry class, attaches an `animationend` listener filtered to events whose target is the wrapper itself, removes the class when the wrapper's animation finishes.
2. **Exit** via `useRouteExit` from `@real-router/svelte`. Returns a Promise the router awaits. Uses `Element.getAnimations()` + `.finished` (scoped to the element) plus `getBoundingClientRect()` to force style flush so the animation is actually registered before we wait on it. Same-route skip via `skipSameRoute` option.

## Svelte pattern

Pages use Svelte's native `bind:this` instead of `useRef`:

```svelte
<script lang="ts">
  let ref: HTMLDivElement | undefined = $state();

  useRouteAnimation(() => ref, { entryClass: "fade-in", exitClass: "fade-out" });
</script>

<div bind:this={ref}>...</div>
```

The composable accepts a `() => HTMLElement | undefined` getter. The getter is read inside the handler at exit / enter time, after the component has mounted and `ref` is defined. No `RefObject` abstraction needed.

## Known limits

- **Entry plays even if a page navigates back to itself.** Mount triggers entry; if you have a `keepAlive` setup that keeps the page mounted across navigations, entry would not replay (because there's no remount). The current flat-routes setup never hits this — every navigation away unmounts.
- **Two pages mounted at once** (e.g. layout that renders multiple `RouteView`s) means each animates independently — both fade out on leave, both fade in on mount. Either dedupe via component composition or fall back to `route-animations/` (centralised) for that scope.
- **No cross-route coordination.** Hero morph requires shared state outside the hook. See `route-animations/`'s `useHeroMorph` for the cross-component recipe in Svelte.
