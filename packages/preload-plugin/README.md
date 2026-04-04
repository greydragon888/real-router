# @real-router/preload-plugin

[![npm](https://img.shields.io/npm/v/@real-router/preload-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/preload-plugin)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/preload-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/preload-plugin)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/preload-plugin&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/preload-plugin&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Preload on navigation intent for [Real-Router](https://github.com/greydragon888/real-router). Trigger data preloading when users hover over or touch links — before they click.

```typescript
// Without plugin — data loads AFTER navigation:
// click → navigate → render → fetch → re-render (waterfall)

// With plugin — data loads BEFORE navigation:
// hover → preload → click → navigate → render (data ready)
```

## Installation

```bash
npm install @real-router/preload-plugin
```

**Peer dependency:** `@real-router/core`

**Runtime dependency:** `@real-router/browser-plugin` must be registered (provides `matchUrl` for URL → route resolution).

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { browserPluginFactory } from "@real-router/browser-plugin";
import { preloadPluginFactory } from "@real-router/preload-plugin";

const routes = [
  {
    name: "users.profile",
    path: "/users/:id",
    preload: async (params) => {
      await queryClient.prefetchQuery({
        queryKey: ["user", params.id],
        queryFn: () => fetchUser(params.id),
      });
    },
  },
  {
    name: "products.detail",
    path: "/products/:slug",
    preload: async (params) => {
      await productStore.prefetch(params.slug);
    },
  },
];

const router = createRouter(routes);
router.usePlugin(browserPluginFactory(), preloadPluginFactory());

await router.start();
```

When a user hovers over a `<Link routeName="users.profile" routeParams={{ id: '123' }}>` for 65ms, the plugin calls `preload({ id: '123' })` — warming up your data layer before navigation.

## Options

```typescript
router.usePlugin(
  preloadPluginFactory({
    delay: 100, // Hover debounce in ms (default: 65)
    networkAware: true, // Disable on Save-Data / 2G (default: true)
  }),
);
```

| Option         | Type      | Default | Description                                          |
| -------------- | --------- | ------- | ---------------------------------------------------- |
| `delay`        | `number`  | `65`    | Milliseconds to wait before triggering hover preload |
| `networkAware` | `boolean` | `true`  | Skip preloading on Save-Data or 2G connections       |

## How It Works

### Zero adapter changes

The plugin uses **DOM-level event delegation** — listeners on `document`, not on individual `<Link>` components. No modifications to React, Vue, Preact, Solid, or Svelte adapters.

### Intent detection

| Trigger   | Event        | Timing                    | Rationale                      |
| --------- | ------------ | ------------------------- | ------------------------------ |
| **Hover** | `mouseover`  | Debounced (configurable)  | Filter accidental mouse passes |
| **Touch** | `touchstart` | ~100ms (scroll detection) | Touch = strong intent signal   |

### Route resolution

```
anchor.href → router.matchUrl(href) → State → getRouteConfig(state.name)?.preload → call
```

External links, routes without `preload`, and non-matching URLs are silently skipped.

### Mobile support

- **Touch preloading**: `touchstart` triggers preload with minimal delay
- **Scroll detection**: `touchmove` with >10px vertical movement cancels pending preload
- **Ghost event suppression**: Synthetic `mouseover` events fired by mobile browsers after `touchstart` are suppressed (prevents double-preload)

All listeners use `{ passive: true }` — never blocks scrolling.

### Network awareness

Preloading is automatically disabled when:

- `navigator.connection.saveData` is enabled
- `navigator.connection.effectiveType` is `2g` or `slow-2g`

Disable with `networkAware: false` if your preload functions handle this themselves.

## Per-Link Opt-Out

```html
<!-- Disable preloading for a specific link -->
<a href="/heavy-page" data-no-preload>Heavy Page</a>
```

Works in all frameworks via prop pass-through:

```tsx
<Link routeName="heavy" data-no-preload>
  Heavy Page
</Link>
```

## Router Extension

The plugin adds one method to the router:

```typescript
router.getPreloadSettings();
// → { delay: 65, networkAware: true }
```

## Data Layer Integration

The plugin is **data-agnostic** — it calls your `preload` function and doesn't care about the result. You control what happens inside:

### TanStack Query

```typescript
{
  name: "users.profile",
  path: "/users/:id",
  preload: async (params) => {
    await queryClient.prefetchQuery({
      queryKey: ["user", params.id],
      queryFn: () => fetchUser(params.id),
    });
  },
}
```

### Zustand / Pinia / Custom Store

```typescript
{
  name: "products.detail",
  path: "/products/:slug",
  preload: async (params) => {
    await productStore.prefetch(params.slug);
  },
}
```

### Multiple Concerns

```typescript
{
  name: "dashboard",
  path: "/dashboard",
  preload: async () => {
    await Promise.all([
      queryClient.prefetchQuery({ queryKey: ["stats"], queryFn: fetchStats }),
      queryClient.prefetchQuery({ queryKey: ["recent"], queryFn: fetchRecent }),
    ]);
  },
}
```

Errors in `preload` are silently caught — error handling is your data layer's responsibility.

## SSR Support

The plugin is SSR-safe — returns an empty plugin object when `document` is not available:

```typescript
// Server-side — no errors, no listeners
router.usePlugin(preloadPluginFactory());
```

## Graceful Degradation

Without `browser-plugin`, `router.matchUrl` is `undefined`. The plugin silently skips preloading via optional chaining — no errors, no warnings.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — Design decisions and data flow
- [Plugin Architecture](https://github.com/greydragon888/real-router/wiki/plugin-architecture) — How plugins integrate with the router

## Related Packages

| Package                                                                                      | Description                            |
| -------------------------------------------------------------------------------------------- | -------------------------------------- |
| [@real-router/core](https://www.npmjs.com/package/@real-router/core)                         | Core router (required peer dependency) |
| [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin)     | Browser plugin (provides `matchUrl`)   |
| [@real-router/lifecycle-plugin](https://www.npmjs.com/package/@real-router/lifecycle-plugin) | Route-level lifecycle hooks            |

## Contributing

See [contributing guidelines](../../CONTRIBUTING.md) for development setup and PR process.

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
