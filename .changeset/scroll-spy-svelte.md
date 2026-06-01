---
"@real-router/svelte": minor
---

Add `scrollSpy` prop to `RouterProvider` — router-coordinated `IntersectionObserver` URL hash spy (#575)

New top-level `scrollSpy?: ScrollSpyOptions` prop wires `createScrollSpy(router, options)` from `shared/dom-utils/`. The URL hash tracks the topmost visible anchor as the user scrolls, syncing `state.context.url.hash` so sibling `<Link hash>` highlights re-evaluate via the standard `createActiveRouteSource` pipeline.

```svelte
<RouterProvider {router} scrollSpy={{ selector: "[id]:is(h2,h3)" }}>
  <!-- Your app -->
</RouterProvider>
```

Emits a forced same-route transition with `{ hash, replace: true, force: true, hashChange: true }` — same write API as `<Link hash>` (#532), `replace: true` so the spy doesn't pollute history. Three anti-flicker gates (`isTransitioning`, `coolingDown` cleared on `scrollend` or 500 ms fallback, `selfEmitting`).

Reactive via `$effect` — primitive fields (`selector`, `rootMargin`) memoised by `$derived`, so inline `scrollSpy={{ selector: "[id]" }}` doesn't thrash on re-renders; `scrollContainer` getter pulled via `untrack` (identity changes don't retrigger).

Requires `browser-plugin` or `navigation-plugin`. Under `hash-plugin` / `memory-plugin` / no URL plugin → warn-once + NOOP. SSR / browsers without `IntersectionObserver` = NOOP.

Behaviour identical to the React adapter — see [Scroll Spy guide](https://github.com/greydragon888/real-router/wiki/Scroll-Spy).
