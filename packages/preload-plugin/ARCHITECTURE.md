# Architecture

> Detailed architecture for AI agents and contributors

## Overview

`@real-router/preload-plugin` triggers user-defined `preload` functions on navigation intent signals (hover, touch) before the user actually navigates. This reduces perceived latency by starting data fetches when the user shows intent, not when they click.

## Package Structure

```
preload-plugin/
├── src/
│   ├── types.ts      — PreloadPluginOptions (2 fields), PreloadFn, PreloadFnFactory
│   ├── constants.ts  — defaultOptions, 3 timing constants, LISTENER_OPTIONS
│   ├── network.ts    — isSlowConnection() (navigator.connection duck-type)
│   ├── plugin.ts     — PreloadPlugin class (event handlers, timer management, resolvePreload)
│   ├── factory.ts    — preloadPluginFactory (SSR guard, options merge, delay coercion)
│   └── index.ts      — Public exports + module augmentation
```

## Event Delegation Design

All listeners attach to `document` at the capture phase rather than individual anchor elements:

- **No per-element setup** — routes can be added/removed dynamically without re-registering listeners
- **Single attach/detach** — `onStart` adds 3 listeners; `onStop` removes them
- **Passive listeners** — shared `LISTENER_OPTIONS` constant (`{ capture: true, passive: true }`) signals no `preventDefault()` use, allowing browser scroll optimization
- **`closest('a[href]')` walk** — `#findAnchor()` uses `target instanceof Element` guard, then `Element.closest()` to find the nearest anchor ancestor regardless of where inside a link the event originates

## Data Flow

```
DOM event (mouseover / touchstart)
    │
    ├── capture phase → document listener
    │
    ├── isGhostMouseEvent? (NaN-arithmetic short-circuit on desktop) → suppress
    │
    ├── #findAnchor(target) → instanceof Element → closest('a[href]') | null
    │
    ├── anchor === currentAnchor? → no-op (debounce same-anchor re-hover)
    │
    ├── data-no-preload? → opt-out
    │
    ├── networkAware && isSlowConnection()? → skip
    │
    ├── router.matchUrl?.(href) → State | undefined (duck-typed from browser-plugin)
    │
    ├── api.getRouteConfig(state.name)?.preload → factory reference
    │   ├── no factory → delete stale cache entry, return
    │   ├── cache hit + same factory reference → return cached fn
    │   └── cache miss or factory changed → compile via factory(router, getDep)
    │       ├── try/catch: factory throw → return undefined (not cached, retry next hover)
    │       └── success → cache { fn, factory } in compiledPreloads Map
    │
    ├── empty touches guard (touchstart/touchmove only) → skip if event.touches.length === 0
    │
    └── setTimeout(delay) → preload(state.params).catch(() => {})
```

## Ghost Event Suppression

Touch devices fire a synthetic `mouseover` after `touchstart` on the same element (legacy compatibility, observed up to ~1450ms on older devices). Without suppression, this would re-trigger hover preloading after touch preloading already fired.

Implementation: two scalar fields `#lastTouchTarget` and `#lastTouchTimeStamp` (initialized to `NaN`). `#isGhostMouseEvent()` computes `delta = event.timeStamp - #lastTouchTimeStamp` and checks `delta >= 0 && delta < GHOST_EVENT_THRESHOLD (2500ms) && event.target === #lastTouchTarget`. The NaN sentinel provides natural short-circuit: `NaN >= 0` is `false`, so on desktop (no prior touch) the check exits in one comparison with zero allocations.

## Factory Reference Cache Invalidation

`#compiledPreloads` stores `{ fn, factory }` pairs keyed by `state.name`. On every resolve, `getRouteConfig(name)?.preload` is read and its reference compared against the cached `factory`. If the reference changed (e.g., after `getRoutesApi(router).replace(newRoutes)`), the old compiled function is discarded and the new factory is compiled. This ensures HMR and dynamic route replacement work without plugin reinstallation.

Cost: one `getRouteConfig()` call per hover event (simple property lookup). The previous approach called `getRouteConfig()` only on cache miss but did not detect stale factories after `replaceRoutes()`.

## Delay Coercion

`preloadPluginFactory(opts)` validates `delay` after merging with defaults:
- `!Number.isFinite(delay)` → coerce to `0` (catches `NaN`, `Infinity`, `-Infinity`)
- `delay < 0` → coerce to `0`

No error thrown — fail-open design consistent with `delay: 0` behavior (fires on next tick).

## Why Duck-Type for matchUrl

`matchUrl` is provided by `@real-router/browser-plugin`. Rather than declaring a hard dependency, the plugin uses optional chaining (`router.matchUrl?.(href)`). This:

- Avoids installing browser-plugin in SSR-only environments
- Allows use with future URL-resolving plugins
- Degrades gracefully (preloads simply never fire without matchUrl)

## Why No Adapter Changes

The plugin reads `preload` via `api.getRouteConfig(name)` — the same mechanism lifecycle-plugin uses for `onEnter`/`onLeave`. No changes to the router core or any framework adapter are needed.

## See Also

- [CLAUDE.md](CLAUDE.md) — Public API and gotchas
- [browser-plugin ARCHITECTURE.md](../browser-plugin/ARCHITECTURE.md) — Provides matchUrl
- [lifecycle-plugin ARCHITECTURE.md](../lifecycle-plugin/ARCHITECTURE.md) — Same getRouteConfig + factory reference cache pattern
