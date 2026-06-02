---
"@real-router/solid": minor
---

Add `scrollSpy` prop to `RouterProvider` — router-coordinated `IntersectionObserver` URL hash spy (#575)

New top-level `scrollSpy?: ScrollSpyOptions` prop wires `createScrollSpy(props.router, props.scrollSpy)` from `shared/dom-utils/`. The URL hash tracks the topmost visible anchor as the user scrolls, syncing `state.context.url.hash` so sibling `<Link hash>` highlights re-evaluate via the standard `createActiveRouteSource` pipeline.

```tsx
<RouterProvider
  router={router}
  scrollSpy={{ selector: "[id]:is(h2,h3)" }}
>
  {props.children}
</RouterProvider>
```

Emits a forced same-route transition with `{ hash, replace: true, force: true, hashChange: true }` — same write API as `<Link hash>` (#532), `replace: true` so the spy doesn't pollute history. Three anti-flicker gates (`isTransitioning`, `coolingDown` cleared on `scrollend` or 500 ms fallback, `selfEmitting`).

Wired through a dedicated `onMount` block (not the shared `mountFeature` helper) so the `selector === ""` opt-out branches before the spy factory runs. Read once on mount — Solid `onMount` is non-reactive, consistent with `scrollRestoration` / `viewTransitions`.

Requires `browser-plugin` or `navigation-plugin`. Under `hash-plugin` / `memory-plugin` / no URL plugin → warn-once + NOOP. SSR / browsers without `IntersectionObserver` = NOOP.

Behaviour identical to the React adapter — see [Scroll Spy guide](https://github.com/greydragon888/real-router/wiki/Scroll-Spy).
