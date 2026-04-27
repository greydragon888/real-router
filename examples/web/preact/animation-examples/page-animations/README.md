# Preact Page Animations Example

Distributed per-page route-animation recipe: each page mounts the{" "}
`useRouteAnimation(ref, { entryClass, exitClass })` hook in its own component, which subscribes to `router.subscribeLeave` / `router.subscribe` for as long as the page is mounted. The hook is route-agnostic — pages declare their own class names.

This is the third first-class animation example in the monorepo, alongside `view-transitions/` (browser VT API) and `route-animations/` (centralised policy through `installRouteAnimations(router)`).

## Three approaches at a glance

|                                        | `view-transitions/`        | `route-animations/`              | `page-animations/` (this)           | `motion-animations/`               |
| -------------------------------------- | -------------------------- | -------------------------------- | ----------------------------------- | ---------------------------------- |
| Mechanism                              | `document.startViewTransition` | Centralised policy + DOM markers | Per-page `useEffect` hook           | `<AnimatePresence>` from `motion`  |
| Router coordination                    | Promise blocks pipeline    | Promise blocks pipeline          | Promise blocks pipeline             | Promise blocks pipeline (via onExitComplete) |
| Where animation logic lives            | One CSS file               | One TS module                    | Each page component                 | App.tsx + inner motion-components  |
| Boilerplate per new route              | None (CSS only)            | Add `data-route-root` attribute  | Add ref + `useRouteAnimation` call  | None (single page-level transition) |
| Cross-route hero morph                 | Free (matching VT names)   | Closure state in policy          | Needs shared state (Context / module var) | Free (`layoutId` prop)        |
| List FLIP with ghost exits             | Free                       | Implemented (≈40 LOC)            | Out of scope                        | Free (`<motion.li layout>`)        |
| Persistent-shell crossfade             | Free                       | Achievable via `data-route-scope` | Out of scope (no nested routes)    | Out of scope (no shell)            |
| External dependency                    | None                       | None                             | None                                | `motion` (~50 KB min+gzip)         |
| Browser support                        | Chromium 111+ / Safari 18+ / Firefox 147+ | Every browser with WAAPI | Every browser with CSS animations   | Every browser with WAAPI           |

Pick `page-animations/` if your animations are entry / exit per page with no cross-route coordination, and you prefer animation logic next to the page that owns it.

## What it covers

- **Per-page distribution**: each page subscribes to the router from its own `useEffect`. Listeners are torn down when the page unmounts (via `useEffect` cleanup) and re-registered when it mounts.
- **Entry + exit per page**: `subscribeLeave` returns a `Promise` that resolves on `animationend`; the router awaits it. `subscribe` adds the entry class on `TRANSITION_SUCCESS`.
- **Per-page choice**: `Products` uses slide-in / slide-out, everything else fades. The hook does not care — pages pass their own class names.
- **`skipSameRoute` guard**: query-only navigations (sort / filter on the same route) skip the animation. Without this, every filter click would re-fade the whole page.
- **Reduced-motion fallback**: 50 ms `setTimeout` releases the router when `animation: none` keeps `animationend` from firing.

## What it does NOT cover

- **Hero morph between pages**: source rect is captured in page A's `useEffect`, but page B's `useEffect` has no access to that closure. Bridging requires module-level state, Context, or a custom event bus.
- **List FLIP with ghost exits**: items disappearing from a filter need cloned DOM held in place during the transition. The hook does not coordinate sibling components.
- **Persistent-shell static regions**: routes are flat-leaf in this example precisely to avoid the false-positive case where a parent shell's listener would fire on a nested-route navigation.

For any of those, use `route-animations/` (centralised policy) or `view-transitions/` (browser API).

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
  ├─ router.subscribeLeave fires →
  │   Home's useEffect listener:
  │     1. ref.current.classList.add('fade-out')
  │     2. void offsetHeight  (force style flush — see below)
  │     3. return Promise.allSettled(getAnimations().map(a => a.finished))
  │
  ├─ router awaits Home's Promise → CSS @keyframes plays on Home's wrapper
  │
  ├─ all wrapper animations finish → Promise resolves → router unblocks
  │
  ├─ Activation guards → setState → TRANSITION_SUCCESS
  │
  ├─ Home unmounts (cleanup useEffect: unsubscribe leave listener,
  │   removes any leftover entry class), About mounts
  │
  └─ About's useEffect runs on mount →
      1. classList.add('fade-in')
      2. animationend (filtered to event.target === wrapper) → remove class
```

**Entry plays on mount, not on `router.subscribe`.** The subscribe path has a fundamental race in the distributed model: `router.subscribe` fires synchronously when the router commits the new state, but the new page's `useEffect` runs only AFTER Preact commits the new DOM — strictly later. The subscribe event arrives before any subscriber on the new page exists, so an entry animation wired through `router.subscribe` would never play. Mount-as-entry sidesteps that entirely.

**`void element.offsetHeight` after `classList.add`.** Browsers lazily compute style. A class added then quickly observed (or removed by something else) without an intervening style read can have its animation skipped entirely — `getAnimations()` returns `[]` and our Promise resolves at once, the router commits without waiting. Reading `offsetHeight` is the canonical no-op trigger that forces style recalc, guaranteeing the animation is actually registered before we await it.

**Why `getAnimations()` instead of `animationend`.** `animationend` bubbles up from descendants — `shared/styles.css` has a `fadeIn` keyframe on `a.active`, for example, and link clicks fire animationend events that would resolve our exit Promise prematurely. `Element.getAnimations()` is scoped to that element only.

## The hook

`src/use-route-animation.ts` (~80 LOC). Two `useEffect` blocks:

1. **Entry** runs on mount only. Adds the entry class, attaches an `animationend` listener filtered to events whose target is the wrapper itself (descendant animations bubble up — link hover effects in `shared/styles.css` would otherwise prematurely strip the class), removes the class when the wrapper's animation finishes.
2. **Exit** subscribes to `router.subscribeLeave` for the lifetime of the page. Returns a Promise the router awaits. Uses `Element.getAnimations()` + `.finished` (scoped to the element) plus `void offsetHeight` to force style flush so the animation is actually registered before we wait on it.

## Known limits

- **Entry plays even if a page navigates back to itself.** Mount triggers entry; if you have a `keepAlive` setup that keeps the page mounted across navigations, entry would not replay (because there's no remount). The current flat-routes setup never hits this — every navigation away unmounts. For a `keepAlive` scenario you'd need to wire entry through the router after all and accept the race (or coordinate via Context).
- **Two pages mounted at once** (e.g. layout that renders multiple `RouteView`s) means each animates independently — both fade out on leave, both fade in on mount. Either dedupe via component composition or fall back to `route-animations/` (centralised) for that scope.
- **No cross-route coordination.** Hero morph and list FLIP require shared state outside the hook. The wiki recipe at `Animation-Library-Integration.md` shows how to bridge with Framer Motion / etc.
