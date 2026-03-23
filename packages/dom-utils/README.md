# dom-utils

> Shared DOM utilities for Real-Router framework adapters.

**Internal package** — consumed by framework adapters. Not published to npm.

## Purpose

Provides shared DOM utilities for all Real-Router framework adapters:

- **Accessibility** — `createRouteAnnouncer` (WCAG-compliant aria-live announcements)
- **Link utilities** — `shouldNavigate`, `buildHref`, `buildActiveClassName`, `applyLinkA11y` (shared by all Link components and directives)

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

### `shouldNavigate(evt: MouseEvent): boolean`

Returns `true` for left-click with no modifier keys (ctrl, meta, alt, shift).

### `buildHref(router, routeName, routeParams): string`

Constructs href string via `router.buildUrl()` with fallback to `router.buildPath()`.

### `buildActiveClassName(isActive, activeClassName, baseClassName): string | undefined`

Concatenates active and base CSS class names when route is active.

### `applyLinkA11y(element: HTMLElement): void`

Sets `role="link"` and `tabindex="0"` on non-interactive elements (skips `<a>` and `<button>`).

## Usage (adapter pattern)

```typescript
// RouterProvider — accessibility
import { createRouteAnnouncer } from "dom-utils";

useEffect(() => {
  if (!announceNavigation) return;
  const announcer = createRouteAnnouncer(router);
  return () => announcer.destroy();
}, [announceNavigation, router]);

// Link component — shared utilities
import { shouldNavigate, buildHref, buildActiveClassName } from "dom-utils";

const href = buildHref(router, routeName, routeParams);
const className = buildActiveClassName(isActive, activeClassName, baseClass);
```

## License

[MIT](../../LICENSE)
