# Architecture

> Detailed architecture for AI agents and contributors

## Overview

`@real-router/preload-plugin` triggers user-defined `preload` functions on navigation intent signals (hover, touch) before the user actually navigates. This reduces perceived latency by starting data fetches when the user shows intent, not when they click.

## Package Structure

```
preload-plugin/
├── src/
│   ├── types.ts      — PreloadPluginOptions (2 fields)
│   ├── constants.ts  — defaultOptions + 3 timing constants
│   ├── network.ts    — isSlowConnection() (navigator.connection duck-type)
│   ├── plugin.ts     — PreloadPlugin class (~230 lines)
│   ├── factory.ts    — preloadPluginFactory (~30 lines)
│   └── index.ts      — Public exports + module augmentation
```

## Event Delegation Design

All listeners attach to `document` at the capture phase rather than individual anchor elements:

- **No per-element setup** — routes can be added/removed dynamically without re-registering listeners
- **Single attach/detach** — `onStart` adds 3 listeners; `onStop` removes them
- **Passive listeners** — `{ capture: true, passive: true }` signals no `preventDefault()` use, allowing browser scroll optimization
- **`closest('a[href]')` walk** — efficiently finds the nearest anchor ancestor regardless of where inside a link the event originates

## Data Flow

```
DOM event (mouseover / touchstart)
    │
    ├── capture phase → document listener
    │
    ├── isGhostMouseEvent? (touch device → synthetic mouseover) → suppress
    │
    ├── closest('a[href]') → HTMLAnchorElement | null
    │
    ├── anchor === currentAnchor? → no-op (debounce same-anchor re-hover)
    │
    ├── data-no-preload? → opt-out
    │
    ├── networkAware && isSlowConnection()? → skip
    │
    ├── router.matchUrl?.(href) → State | undefined (duck-typed from browser-plugin)
    │
    ├── api.getRouteConfig(state.name)?.preload → (params) => Promise<unknown>
    │
    └── setTimeout(delay) → preload(state.params).catch(() => {})
```

## Ghost Event Suppression

Touch devices fire a synthetic `mouseover` ~300ms after `touchstart` on the same element (legacy compatibility). Without suppression, this would re-trigger hover preloading after touch preloading already fired:

```
touchstart → touch timer fires preload at 100ms
synthetic mouseover at ~300ms → would restart hover timer → double preload
```

Suppression: `lastTouchStartEvent` records `{ target, timeStamp }`. Any `mouseover` from the same target within `GHOST_EVENT_THRESHOLD` (2500ms) is discarded.

## Why No Adapter Changes

The plugin reads `preload` via `api.getRouteConfig(name)` — the same mechanism lifecycle-plugin uses for `onEnter`/`onLeave`. No changes to the router core or any framework adapter are needed.

## Why Duck-Type for matchUrl

`matchUrl` is provided by `@real-router/browser-plugin`. Rather than declaring a hard dependency, the plugin uses optional chaining (`router.matchUrl?.(href)`). This:

- Avoids installing browser-plugin in SSR-only environments
- Allows use with future URL-resolving plugins
- Degrades gracefully (preloads simply never fire without matchUrl)

## See Also

- [CLAUDE.md](CLAUDE.md) — Public API and gotchas
- [browser-plugin ARCHITECTURE.md](../browser-plugin/ARCHITECTURE.md) — Provides matchUrl
- [lifecycle-plugin ARCHITECTURE.md](../lifecycle-plugin/ARCHITECTURE.md) — Same getRouteConfig pattern
