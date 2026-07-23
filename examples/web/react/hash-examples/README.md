# React Hash Examples

> Three demos sharing one axis: URL hash fragment ↔ DOM scroll position. All three use `browser-plugin` or `navigation-plugin` (where `#` is a fragment identifier), NOT `hash-plugin` (where `#` is a path delimiter — incompatible, see [`../hash-routing/`](../hash-routing/)).

| Subdir | Issue | Demonstrates |
| --- | --- | --- |
| [`link-hash/`](./link-hash) | [#532](https://github.com/greydragon888/real-router/issues/532) | `<Link hash="section">` as tab state — `state.context.url.hash` re-evaluates `createActiveRouteSource`, only matching tab lights up. Companion: hash-plugin fallback path (warn-once + no-op). |
| [`scroll-restoration/`](./scroll-restoration) | [#534](https://github.com/greydragon888/real-router/issues/534) | `createScrollRestoration` behaviour matrix — restore / top / native modes; `anchorScrolling: true` honors `#fragment` on initial load; F5 priming via `sessionStorage`; `transition.replace` skip path (closes magnetic-snap under browser-plugin). |
| [`scroll-spy/`](./scroll-spy) | [#575](https://github.com/greydragon888/real-router/issues/575) | `createScrollSpy` — scroll position writes URL hash. `IntersectionObserver` + rAF + 150ms debounce + rootMargin-aware topmost selection + Map-accumulation across batches. Cooldown gate avoids URL flicker during user-driven `<Link hash>` smooth scroll. |

## Shared infrastructure

All three demos rely on the same router-level primitives:

- `state.context.url.hash` — claimed by URL plugins via `claimContextNamespace("url")`; decoded fragment, no leading `#`.
- `navigateWithHash` — shared `<Link>` click helper from #532; auto-bypasses `SAME_STATES` for same-route different-hash via `force: true, hashChange: true`.
- `createActiveRouteSource` — cached, hash-aware subscription source (`@real-router/sources`); identical key shape across all three.
- `state.transition.replace` — portable signal from foundation RFC; coordinates scroll-restoration and scroll-spy under both URL plugins.

This is a single pipeline:

```
write side:
  <Link hash="x"> click ──┐
                          ├─► router.navigate(name, params, search, { hash, force, hashChange })
  scroll-spy IO ──────────┤   │
                          │   ▼
                          │   URL plugin onTransitionSuccess: state.context.url.{hash, hashChanged}
                          │   │
                          │   ▼
read side:                │   createActiveRouteSource notifies subscribers
  <Link hash> active class ◄──┤
  TocSidebar highlight ───────┤
  scroll-restoration anchor ──┘ (honors state.context.url.hash on initial)
```

`scroll-restoration` also reads `transition.replace` (foundation RFC) — skips restore on spy-emitted transitions so the spy and restoration don't fight over scroll position. See `scroll-spy/README.md` for the full coexistence matrix.

## URL plugin compatibility matrix

| URL plugin | `<Link hash>` | `createScrollRestoration` | `createScrollSpy` |
| --- | --- | --- | --- |
| `navigation-plugin` | ✅ Full + direction/traverse signals | ✅ Full (replace/reload/traverse disambiguation) | ✅ Full |
| `browser-plugin` | ✅ Full | ✅ After foundation RFC (`transition.replace` portable) | ✅ Full |
| `hash-plugin` | ❌ warn-once + no-op | ⚠️ `anchorScrolling` ignored | ❌ warn-once + no-op |
| `memory-plugin` | ❌ no URL | ❌ no DOM | ❌ no URL |

## Quick start (any of the three)

```bash
pnpm bundle                                              # rebuild shared/dom-utils dist
pnpm -F react-link-hash-example dev                      # http://localhost:5173
pnpm -F react-scroll-restoration-example dev             # http://localhost:5173
pnpm -F react-scroll-spy-example dev                     # http://localhost:5173
```

Each example ships its own `test:e2e` Playwright suite covering RFC acceptance scenarios.

## See also

- [Hash wiki page](https://github.com/greydragon888/real-router/wiki/Hash) — full API surface
- [Scroll Restoration wiki](https://github.com/greydragon888/real-router/wiki/Scroll-Restoration) — restore/top/native modes
- [Scroll Spy wiki](https://github.com/greydragon888/real-router/wiki/Scroll-Spy) — full API (after Stage 4)
- [`../hash-routing/`](../hash-routing/) — separate category: hash-plugin URL strategy
- [`../ssr-examples/`](../ssr-examples/) — pattern reference for thematic subgroups (server-rendering approaches)
