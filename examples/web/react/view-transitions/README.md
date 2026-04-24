# React View Transitions Example

Demonstrates browser View Transitions API integration via the `viewTransitions` prop on `RouterProvider`.

## What it covers

- `<RouterProvider viewTransitions>` — one-prop opt-in, utility auto-wires `subscribeLeave` → `document.startViewTransition` → `subscribe` → `requestAnimationFrame`
- **Basic crossfade** — `::view-transition-old(root)` / `::view-transition-new(root)` keyframes
- **Hero morph** — matching `view-transition-name: product-cover-${id}` on thumb + detail cover, automatic FLIP-style morph
- **Per-area VT** — dedicated `view-transition-name` on a container (`query-demo-list`) isolates its animation from the root
- **Query-only navigation** — filter changes still animate through the VT pipeline
- **Direction-aware** — `data-nav-direction` on `<html>` flips between forward / back keyframes (popstate → back)
- **Reduced motion** — `@media (prefers-reduced-motion: reduce)` collapses animation-duration to zero
- **Feature fallback** — browsers without `document.startViewTransition` see the utility return a no-op, navigation still works
- **Abort safety** — rapid clicks cancel in-flight transitions; the AbortSignal from LeaveState releases the deferred so stale VT animations are skipped

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

- Chrome 111+ / Edge 111+ / Opera 97+
- Safari 18+ (released Sep 2024)
- Firefox: behind `dom.viewTransitions.enabled` flag

Without support, the utility is a no-op — routes still swap, just without animation.

## Architectural note: exit animation cannot be synchronised with state change via the VT API alone

A common expectation: "click link → **exit** plays → router state changes (URL updates) → **entry** plays". This sequencing is **impossible** when using the View Transitions API as the animation driver, because of how the API's promise lifecycle interacts with our awaited `subscribeLeave` contract.

### The three promises VT exposes

`document.startViewTransition(updateCallback)` returns a `ViewTransition` object with three observable promises:

| Promise              | Resolves when                                                |
| -------------------- | ------------------------------------------------------------ |
| `updateCallbackDone` | `updateCallback`'s returned promise settles                  |
| `ready`              | both old and new snapshots captured (= after `updateCallbackDone`) |
| `finished`           | all animations complete (= strictly after `ready`)           |

**All three depend on `updateCallback`'s promise resolving.** There is no publicly exposed promise for "old snapshot captured" — the API does not split its setup phase into observable sub-steps.

### Why this creates a deadlock

In this example:

1. `subscribeLeave` fires and calls `startViewTransition(() => deferred)` — browser captures old snapshot, then calls our updateCallback which returns `deferred` (a Promise we own).
2. `deferred` is resolved in `router.subscribe` (fires at `TRANSITION_SUCCESS`, after `setState`).
3. `TRANSITION_SUCCESS` only fires **after** `subscribeLeave` listeners resolve (the router awaits them — see RFC TRANSITION_LEAVE_APPROVE).

If we wanted `subscribeLeave` to **block** the router until exit animation completed, we would return `vt.ready` (or `vt.finished`, or `vt.updateCallbackDone`) from the listener. But:

```
vt.ready  ←  awaits updateCallback  ←  awaits deferred  ←  resolved in router.subscribe
                                                              ↓
  ↑                                                           │
  └──  router.subscribe awaits subscribeLeave resolution  ────┘
```

The cycle is closed. `subscribeLeave` waits on `vt.ready`, which waits on the deferred, which is resolved in a listener that only runs after `subscribeLeave` resolves. The router never advances past LEAVE_APPROVED.

### What the current demo actually does

The utility does **not** return a promise from `subscribeLeave` — the listener is fire-and-forget. This means:

- `startViewTransition` is called synchronously at LEAVE_APPROVED.
- Browser captures old snapshot and **pauses** (showing the frozen snapshot) while waiting for `deferred`.
- Router continues immediately: activation guards → `setState` → `TRANSITION_SUCCESS` emits.
- At `TRANSITION_SUCCESS`, three things happen synchronously in listener order:
  - `browser-plugin` pushes the new URL to history (user-visible URL change).
  - Our utility schedules `requestAnimationFrame(resolver)`.
  - React's `useSyncExternalStore` schedules a re-render.
- On the next frame, React has committed the new DOM; the rAF callback resolves `deferred`.
- Browser captures new snapshot and plays the full exit + entry keyframes together.

**Consequence:** the URL in the address bar updates at the moment `TRANSITION_SUCCESS` fires, which is **before** the VT animation begins. For short transitions (200–400 ms, typical for production) the desync is imperceptible; for the intentionally slow durations in this demo (2400 ms root) it is visible.

### If you want strict `exit → state-change → entry` ordering

Use manual animations for the exit phase (CSS class, Web Animations API, or a library such as Motion / Framer Motion / GSAP) on the real DOM. Return a Promise from `subscribeLeave` that resolves when the exit animation finishes — this **does** block the router, since `subscribeLeave` is awaited. Then either:

- let `TRANSITION_SUCCESS` drive the entry via VT API (our current utility), which animates from the exited state to the new state; or
- animate the entry manually too (symmetric with exit) and skip the VT API altogether for the root transition.

Shared-element morph (`view-transition-name` on hero elements like the product cover) **does** integrate cleanly with this hybrid approach — VT continues to handle morphs while manual animations handle root exit/entry.

### Summary table

| Intent                                                    | Mechanism                                                   |
| --------------------------------------------------------- | ----------------------------------------------------------- |
| Exit animation that blocks state change                   | Manual (CSS / WAAPI / animation library) + awaited `subscribeLeave` |
| Entry animation                                           | VT API (this example) or manual                             |
| Shared-element morph (FLIP, hero transitions)             | VT API `view-transition-name` — only practical option       |
| Simple cross-page crossfade / slide, URL-desync acceptable | VT API as in this example                                  |
