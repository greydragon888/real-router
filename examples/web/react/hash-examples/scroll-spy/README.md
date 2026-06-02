# Real-Router — Scroll Spy Example

> Dogfood for issue [#575 — Scroll spy utility (`createScrollSpy`)](https://github.com/greydragon888/real-router/issues/575).

This example demonstrates **router-coordinated scroll spy** — `IntersectionObserver`-driven URL hash updates that track the topmost visible heading as the user scrolls. The URL hash is bookmark-able, share-able, and synchronised with sibling `<Link hash>` highlighting via the standard `createActiveRouteSource` pipeline.

## Quick start

```bash
pnpm bundle                                     # rebuild shared/dom-utils dist
pnpm -F react-scroll-spy-example dev            # http://localhost:5173
pnpm -F react-scroll-spy-example build          # tsc -b + vite build
pnpm -F react-scroll-spy-example test:e2e       # 10 tests
```

Open `/article`, scroll through 12 sections — the URL bar tracks the active heading in real time. The Hash Indicator (bottom-left) shows `state.context.url.hash`; the Scroll Meter (bottom-right) shows `navigate()`/sec rate (≤ 10/sec acceptance per RFC §8.4).

## Why not a plugin

`createScrollSpy` lives in `shared/dom-utils/`, not as a `@real-router/scroll-spy-plugin`. Reasons:

- Router-core is DOM-agnostic — `IntersectionObserver` is a DOM concern.
- All routing-layer inputs the utility needs are already published by URL plugins (`browser-plugin` / `navigation-plugin`) via `state.context.url.hash`.
- Symmetric to `createScrollRestoration`, `createRouteAnnouncer`, `createViewTransitions` — all framework-agnostic DOM helpers wired into `RouterProvider` per adapter.

See [RFC §13 Out of scope](../../../../.claude/rfc-scroll-spy-utility-short.md#13-out-of-scope) for the full architectural rationale.

## Plugin & spy mode selectors

The example bundles **both** `@real-router/browser-plugin` and `@real-router/navigation-plugin` and selects one at startup via `?plugin=` query. The spy can be wired either through the `RouterProvider scrollSpy` prop (default) or via a route-aware dynamic selector (`?spy=per-route`).

| URL | Plugin | Spy mode | Demonstrates |
| --- | --- | --- | --- |
| `/` (default) | `navigation-plugin` | `provider` | Default mode — global selector `[id]:is(h2,h3)` applies on all routes |
| `?plugin=browser` | `browser-plugin` | `provider` | Foundation RFC §10.7 — spy-emit with `replace: true` skips `scrollToHashOrTop` under browser-plugin via portable `state.transition.replace`; no magnetic snap |
| `?plugin=navigation` (default) | `navigation-plugin` | `provider` | Richer signals (direction/traverse) via `state.context.navigation` |
| `?spy=per-route` | (either URL plugin) | `per-route` | Dynamic selector per route — `/article`: `[id]:is(h2,h3)`, `/guide`: `[id]:is(h2):not(.no-spy)`, `/about`: no spy. RFC §11 promotion path dogfood |

## Behaviour matrix

| Event | Result |
| --- | --- |
| Scroll past sections | URL hash tracks topmost visible h2; debounced ≤ 10/sec |
| Click TOC `<Link hash>` to far section | URL goes directly to target; no flicker through intermediate sections (cooldown gate) |
| F5 / direct load on `/article#section-5` | Scroll lands at section; spy preserves hash (same-hash check) |
| Hash with no matching id (`/article#nonexistent`) | Spy self-heals to topmost real anchor on initial IO callback |
| Route without `[id]` anchors (`/about`) | Spy doesn't emit; previous hash preserved |
| Invalid CSS selector | Spy enters `silenced` state, one `console.warn`, no emits |
| Under `?plugin=browser` | Spy-emit `replace:true` → scroll-restoration skips (no magnetic snap) — foundation RFC §10.7 closure |

## Recipes

### Recipe A — Custom IntersectionObserver alongside spy

Not bundled in this example (deferred per RFC §4 non-goals); see `LazyImage` recipe in [wiki Scroll-Spy page](https://github.com/greydragon888/real-router/wiki/Scroll-Spy). Key point: scroll-spy doesn't conflict with user-land IO — they're independent instances.

### Recipe B — Per-route different selector (RFC §11 promotion path)

Activated via `?spy=per-route`. App.tsx computes the spy selector dynamically based on the active route, reusing the standard `RouterProvider scrollSpy` prop:

```tsx
const [routeName, setRouteName] = useState(() => router.getState()?.name ?? "");
useEffect(() => router.subscribe(({ route }) => setRouteName(route.name)), [router]);

const scrollSpyOptions =
  spyMode === "provider"
    ? { selector: "[id]:is(h2,h3)" }
    : ((): { selector: string } | undefined => {
        if (routeName === "article") return { selector: "[id]:is(h2,h3)" };
        if (routeName === "guide") return { selector: "[id]:is(h2):not(.no-spy)" };
        return undefined;
      })();

return <RouterProvider router={router} scrollSpy={scrollSpyOptions}>...
```

No direct `createScrollSpy` import needed — `RouterProvider`'s `scrollSpy` prop is reactive via primitive-deps in `useEffect`. Source: `src/App.tsx`.

### Recipe C — TOC sidebar

`TocSidebar.tsx` maps sections to `<Link hash>`. No extra subscription — `createActiveRouteSource` (cached in `@real-router/sources`) reads `state.context.url.hash`, fires per-Link active state changes when spy emits. Source: `src/components/TocSidebar.tsx`.

```tsx
<Link routeName="article" hash="section-5" activeClassName="toc__link--active">
  Section 5
</Link>
```

## Scenarios (10 e2e tests)

| # | Scenario | RFC |
| --- | --- | --- |
| 1 | Sequential scroll → hash updates in order | §8.3 #1 |
| 1b | Continuous scrollBy() 1 sec → ≤ 10 navigate/sec (rate ceiling) | §8.4 |
| 2 | TOC click → URL goes directly to target, no flicker | §8.3 #2 |
| 3 | F5 on `/article#section-5` → hash preserved | §8.3 #3 |
| 4 | `/article#nonexistent` → self-heals to topmost real anchor | §8.3 #4 |
| 5 | TOC sidebar auto-highlight follows scroll | §8.3 #5 |
| 11 | `?plugin=browser` — spy + scroll-restoration coexist (no magnetic snap) | Foundation RFC §10.7 |
| Bonus 6 | Invalid selector handling (silenced state) | RFC §7 |
| Bonus 9 | `?spy=per-route` — per-route selector excludes `.no-spy` h2 on `/guide` | RFC §11 |
| Bonus 10 | Route without `[id]` (`/about`) — no emits, hash preserved | RFC §7 |

## Plugin dependencies

| Plugin | In example | Effect |
| --- | --- | --- |
| `navigation-plugin` | yes (default) | Provides `state.context.url` + `state.context.navigation` (rich direction/traverse) |
| `browser-plugin` | yes (`?plugin=browser`) | Provides `state.context.url`; `state.transition.replace` is the only co-existence signal scroll-restoration honours (foundation RFC §10.7) |
| `hash-plugin` | **NO** | `#` = path delimiter under hash-plugin → fundamentally incompatible. Spy warns once and no-ops. See `examples/web/react/hash-routing/` for hash-plugin URL strategy demo. |

`browser-plugin` and `navigation-plugin` are **interchangeable** (not complementary) for scroll-spy. The example uses the query selector to switch between them at startup — both modes pass all 10 scenarios except Scenario 11, which is browser-plugin-specific (it validates the foundation RFC closure for browser-plugin's previous magnetic-snap behaviour).

## Implementation notes

- **Initial hash auto-scroll** — `applyInitialAnchorScroll()` in `main.tsx` polls for the `#hash` element on cold load. `createScrollRestoration` subscribes to the router AFTER `router.start()`'s first `TRANSITION_SUCCESS` fires, so it doesn't see the initial route's hash. The userland fixup mirrors the [scroll-restoration sibling](../scroll-restoration/src/main.tsx)'s pattern.
- **`window.__router` exposure** — `main.tsx` writes `globalThis.__router = router` for e2e instrumentation. Tests use `router.subscribe` in `page.evaluate` to log every transition — portable between URL plugins, unlike `history.replaceState` spy which only catches browser-plugin under History API.
- **Spy mutex** — `<RouterProvider scrollSpy>` prop and `?spy=per-route` are mutually exclusive. In `per-route` mode App.tsx computes the prop reactively from current route name; in `provider` mode the prop is a static `{ selector: "[id]:is(h2,h3)" }`.
- **Section height ~80vh** — `article__section { min-height: 80vh }` ensures `IntersectionObserver` reliably fires as the user scrolls between sections. The TOC sidebar is `position: sticky` so it stays visible during scroll.

## See also

- [issue #575](https://github.com/greydragon888/real-router/issues/575) — design
- [RFC `rfc-scroll-spy-utility-short.md`](../../../../.claude/rfc-scroll-spy-utility-short.md) — full design rationale
- [Foundation RFC `rfc-transition-meta-discrimination.md`](../../../../.claude/rfc-transition-meta-discrimination.md) — `state.transition.replace` portable signal
- [`../link-hash/`](../link-hash) — `<Link hash>` tab UI demo (#532) — sibling in `hash-examples/`
- [`../scroll-restoration/`](../scroll-restoration) — `createScrollRestoration` behaviour matrix (#534) — sibling
- [Wiki: Scroll Spy](https://github.com/greydragon888/real-router/wiki/Scroll-Spy) — full API surface (after Stage 4)
- [`examples/web/react/hash-routing/`](../../hash-routing) — separate category: hash-plugin URL strategy (different feature)
