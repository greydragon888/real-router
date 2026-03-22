# dom-utils

> Shared DOM utilities for Real-Router framework adapters.

**Internal package** — consumed by framework adapters. Not published to npm.

## Purpose

Provides browser-specific accessibility logic shared across all Real-Router adapters. Currently implements `createRouteAnnouncer` — a WCAG-compliant aria-live announcement system for SPA route changes.

## Consumers

- `@real-router/react`
- `@real-router/preact`
- `@real-router/solid`
- `@real-router/vue`
- `@real-router/svelte`

## Public API

### `createRouteAnnouncer(router, options?)`

Creates a route change announcer that notifies screen reader users on every navigation.

| Parameter | Type                     | Description                 |
| --------- | ------------------------ | --------------------------- |
| `router`  | `Router`                 | Real-Router router instance |
| `options` | `RouteAnnouncerOptions?` | Optional configuration      |

Returns `{ destroy: () => void }`.

### `RouteAnnouncerOptions`

| Option                | Type                       | Default           | Description                                                |
| --------------------- | -------------------------- | ----------------- | ---------------------------------------------------------- |
| `prefix`              | `string`                   | `"Navigated to "` | Text prepended to the announcement                         |
| `getAnnouncementText` | `(route: State) => string` | —                 | Custom text resolver; empty string suppresses announcement |

## Usage (adapter pattern)

```typescript
import { createRouteAnnouncer } from "dom-utils";

useEffect(() => {
  if (!announceNavigation) return;
  const announcer = createRouteAnnouncer(router);
  return () => announcer.destroy();
}, [announceNavigation, router]);
```

## License

[MIT](../../LICENSE)
