# @real-router/browser-plugin

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

Browser History API integration for Real-Router. Synchronizes router state with browser URL and handles back/forward navigation.

## Installation

```bash
npm install @real-router/browser-plugin
# or
pnpm add @real-router/browser-plugin
# or
yarn add @real-router/browser-plugin
# or
bun add @real-router/browser-plugin
```

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { browserPluginFactory } from "@real-router/browser-plugin";

const router = createRouter([
  { name: "home", path: "/" },
  { name: "products", path: "/products/:id" },
  { name: "cart", path: "/cart" },
]);

// Basic usage
router.usePlugin(browserPluginFactory());

// With options
router.usePlugin(
  browserPluginFactory({
    useHash: false,
    base: "/app",
  }),
);

router.start();
```

---

## Configuration

```typescript
router.usePlugin(
  browserPluginFactory({
    useHash: true, // Required for hashPrefix
    hashPrefix: "!",
  }),
);

router.navigate("products", { id: "123" });
// URL: http://example.com/#!/products/123
```

| Option            | Type      | Default | Description                                                          |
| ----------------- | --------- | ------- | -------------------------------------------------------------------- |
| `useHash`         | `boolean` | `false` | Use hash routing (`#/path`) instead of History API                   |
| `hashPrefix`      | `string`  | `""`    | Hash prefix (e.g., `"!"` → `#!/path`). Only with `useHash: true`     |
| `preserveHash`    | `boolean` | `true`  | Keep URL hash fragment during navigation. Only with `useHash: false` |
| `base`            | `string`  | `""`    | Base path for all routes (e.g., `"/app"`)                            |
| `forceDeactivate` | `boolean` | `true`  | Bypass `canDeactivate` guards on browser back/forward                |
| `mergeState`      | `boolean` | `false` | Merge with existing `history.state`                                  |

**Type Safety:** Options use discriminated union — `hashPrefix` and `preserveHash` are mutually exclusive at compile time.

See [Wiki](https://github.com/greydragon888/real-router/wiki/browser-plugin#3-configuration-options) for detailed option descriptions and examples.

---

## Added Router Methods

The plugin extends the router with browser-specific methods:

#### `router.buildUrl(name: string, params?: Params): string`
Build full URL with base path and hash prefix.\
`name: string` — route name\
`params?: Params` — route parameters\
Returns: `string` — full URL\
[Wiki](https://github.com/greydragon888/real-router/wiki/browser-plugin#5-router-interaction)

```typescript
const state = router.lastKnownState;
// Returns frozen copy of state or undefined

if (state) {
  console.log("Last route:", state.name);
  console.log("Parameters:", state.params);
}
```

#### `router.matchUrl(url: string): State | undefined`
Parse URL to router state.\
`url: string` — URL to parse\
Returns: `State | undefined`\
[Wiki](https://github.com/greydragon888/real-router/wiki/browser-plugin#5-router-interaction)

```typescript
router.navigate("page1");
router.navigate("page2");
router.navigate("page3");

// User clicks back twice rapidly
// Plugin ensures router ends at page1
// URL and router state remain synchronized
```

#### `router.replaceHistoryState(name: string, params?: Params, title?: string): void`
Update browser URL without triggering navigation.\
`name: string` — route name\
`params?: Params` — route parameters\
`title?: string` — page title\
Returns: `void`\
[Wiki](https://github.com/greydragon888/real-router/wiki/browser-plugin#5-router-interaction)

```typescript
router.replaceHistoryState("users", { id: "456" });
```

#### `router.lastKnownState: State | undefined`
Last successful navigation state (readonly).\
Returns: `State | undefined`\
[Wiki](https://github.com/greydragon888/real-router/wiki/browser-plugin#5-router-interaction)

---

## Usage Examples

### History Mode (default)

```typescript
router.usePlugin(
  browserPluginFactory({
    base: "/app",
    preserveHash: true,
  }),
);

router.navigate("users", { id: "123" });
// URL: /app/users/123
```

### Hash Mode

```typescript
router.usePlugin(
  browserPluginFactory({
    useHash: true,
    hashPrefix: "!",
  }),
);

router.navigate("users", { id: "123" });
// URL: #!/users/123
```

### Form Protection

```typescript
router.usePlugin(
  browserPluginFactory({
    forceDeactivate: false,
  }),
);

router.addDeactivateGuard("checkout", () => (toState, fromState, done) => {
  if (hasUnsavedChanges()) {
    done({ error: new Error("Unsaved changes") });
  } else {
    done();
  }
});
```

---

## SSR Support

The plugin is SSR-safe with automatic fallback:

```typescript
// Server-side — no errors, methods return safe defaults
router.usePlugin(browserPluginFactory());
router.buildUrl("home"); // Works
router.matchUrl("/path"); // Returns undefined
```

---

## Documentation

Full documentation available on the [Wiki](https://github.com/greydragon888/real-router/wiki/browser-plugin):

- [Configuration Options](https://github.com/greydragon888/real-router/wiki/browser-plugin#3-configuration-options)
- [Lifecycle Hooks](https://github.com/greydragon888/real-router/wiki/browser-plugin#4-lifecycle-hooks)
- [Router Methods](https://github.com/greydragon888/real-router/wiki/browser-plugin#5-router-interaction)
- [Behavior & Edge Cases](https://github.com/greydragon888/real-router/wiki/browser-plugin#8-behavior)
- [Migration from router5](https://github.com/greydragon888/real-router/wiki/browser-plugin#11-migration-from-router5)

---

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — Core router
- [@real-router/react](https://www.npmjs.com/package/@real-router/react) — React integration
- [@real-router/logger-plugin](https://www.npmjs.com/package/@real-router/logger-plugin) — Debug logging

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
