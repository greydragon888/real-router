# @real-router/hash-plugin

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

Hash-based routing plugin for Real-Router. Uses URL hash fragment for navigation — no server configuration needed.

## Installation

```bash
npm install @real-router/hash-plugin
# or
pnpm add @real-router/hash-plugin
# or
yarn add @real-router/hash-plugin
# or
bun add @real-router/hash-plugin
```

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { hashPluginFactory } from "@real-router/hash-plugin";

const router = createRouter([
  { name: "home", path: "/" },
  { name: "products", path: "/products/:id" },
  { name: "cart", path: "/cart" },
]);

// Basic usage
router.usePlugin(hashPluginFactory());

// With options
router.usePlugin(
  hashPluginFactory({
    hashPrefix: "!",
  }),
);

await router.start();
```

---

## Configuration

```typescript
router.usePlugin(
  hashPluginFactory({
    hashPrefix: "!",
    forceDeactivate: true,
  }),
);

router.navigate("products", { id: "123" });
// URL: http://example.com/#!/products/123
```

| Option            | Type      | Default | Description                                           |
| ----------------- | --------- | ------- | ----------------------------------------------------- |
| `hashPrefix`      | `string`  | `""`    | Prefix after `#` (e.g., `"!"` → `#!/path`)            |
| `base`            | `string`  | `""`    | Base path before hash (e.g., `"/app"` → `/app#/path`) |
| `forceDeactivate` | `boolean` | `true`  | Bypass `canDeactivate` guards on browser back/forward |

> **Looking for History API routing?** Use [`@real-router/browser-plugin`](https://www.npmjs.com/package/@real-router/browser-plugin) instead.

See [Wiki](https://github.com/greydragon888/real-router/wiki/hash-plugin) for detailed option descriptions and examples.

---

## Added Router Methods

The plugin extends the router instance with browser-specific methods (via [`extendRouter()`](https://github.com/greydragon888/real-router/wiki/extendRouter)):

#### `router.buildUrl(name: string, params?: Params): string`

Build full URL with hash prefix.\
`name: string` — route name\
`params?: Params` — route parameters\
Returns: `string` — full URL\
[Wiki](https://github.com/greydragon888/real-router/wiki/hash-plugin#5-router-interaction)

```typescript
router.buildUrl("users", { id: "123" });
// => "#!/users/123" (with hashPrefix "!")
```

#### `router.matchUrl(url: string): State | undefined`

Parse URL to router state.\
`url: string` — URL to parse\
Returns: `State | undefined`\
[Wiki](https://github.com/greydragon888/real-router/wiki/hash-plugin#5-router-interaction)

```typescript
const state = router.matchUrl("https://example.com/#!/users/123");
// => { name: "users", params: { id: "123" }, ... }
```

#### `router.replaceHistoryState(name: string, params?: Params, title?: string): void`

Update browser URL without triggering navigation.\
`name: string` — route name\
`params?: Params` — route parameters\
`title?: string` — page title\
Returns: `void`\
[Wiki](https://github.com/greydragon888/real-router/wiki/hash-plugin#5-router-interaction)

```typescript
router.replaceHistoryState("users", { id: "456" });
```

---

## Usage Examples

### Hashbang Routing

```typescript
router.usePlugin(
  hashPluginFactory({
    hashPrefix: "!",
  }),
);

router.navigate("users", { id: "123" });
// URL: #!/users/123
```

### With Base Path

```typescript
router.usePlugin(
  hashPluginFactory({
    hashPrefix: "!",
    base: "/app",
  }),
);

router.navigate("users", { id: "123" });
// URL: /app#!/users/123
```

### Form Protection

```typescript
router.usePlugin(
  hashPluginFactory({
    forceDeactivate: false,
  }),
);

import { getLifecycleApi } from "@real-router/core/api";

const lifecycle = getLifecycleApi(router);
lifecycle.addDeactivateGuard("checkout", () => (toState, fromState) => {
  return !hasUnsavedChanges(); // false blocks navigation
});
```

---

## SSR Support

The plugin is SSR-safe with automatic fallback:

```typescript
// Server-side — no errors, methods return safe defaults
router.usePlugin(hashPluginFactory());
router.buildUrl("home"); // Works
router.matchUrl("/path"); // Returns undefined
```

---

## Why Hash Routing?

Hash-based routing stores the entire route in the URL hash fragment (`#/path`). This means:

- **No server configuration** — the server always serves the same `index.html` regardless of the URL
- **Works on static hosting** — GitHub Pages, S3, Netlify (without redirect rules)
- **Legacy browser support** — works everywhere that supports `hashchange` events

The tradeoff is less clean URLs (`example.com/#!/users` vs `example.com/users`).

---

## Documentation

Full documentation available on the [Wiki](https://github.com/greydragon888/real-router/wiki/hash-plugin):

- [Configuration Options](https://github.com/greydragon888/real-router/wiki/hash-plugin#3-configuration-options)
- [Lifecycle Hooks](https://github.com/greydragon888/real-router/wiki/hash-plugin#4-lifecycle-hooks)
- [Router Methods](https://github.com/greydragon888/real-router/wiki/hash-plugin#5-router-interaction)
- [Behavior & Edge Cases](https://github.com/greydragon888/real-router/wiki/hash-plugin#8-behavior)

---

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — Core router
- [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) — History API routing
- [@real-router/react](https://www.npmjs.com/package/@real-router/react) — React integration
- [@real-router/logger-plugin](https://www.npmjs.com/package/@real-router/logger-plugin) — Debug logging

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
