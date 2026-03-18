# @real-router/hash-plugin

[![npm](https://img.shields.io/npm/v/@real-router/hash-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/hash-plugin)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/hash-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/hash-plugin)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/hash-plugin&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/hash-plugin&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Hash-based routing plugin for [Real-Router](https://github.com/greydragon888/real-router). Uses URL hash fragment (`#/path`) for navigation — no server configuration needed.

Works on static hosting (GitHub Pages, S3, Netlify) without redirect rules. Tradeoff: URLs include `#` (`example.com/#!/users` vs `example.com/users`).

> **Looking for clean URLs?** Use [`@real-router/browser-plugin`](https://www.npmjs.com/package/@real-router/browser-plugin) (History API).

## Installation

```bash
npm install @real-router/hash-plugin
```

**Peer dependency:** `@real-router/core`

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { hashPluginFactory } from "@real-router/hash-plugin";

const router = createRouter([
  { name: "home", path: "/" },
  { name: "users", path: "/users/:id" },
]);

router.usePlugin(hashPluginFactory());
await router.start(); // reads hash from browser location
```

## Options

| Option            | Type      | Default | Description                                           |
| ----------------- | --------- | ------- | ----------------------------------------------------- |
| `hashPrefix`      | `string`  | `""`    | Prefix after `#` (e.g., `"!"` → `#!/path`)            |
| `base`            | `string`  | `""`    | Base path before hash (e.g., `"/app"` → `/app#/path`) |
| `forceDeactivate` | `boolean` | `true`  | Bypass `canDeactivate` guards on back/forward         |

```typescript
router.usePlugin(hashPluginFactory({ hashPrefix: "!", base: "/app" }));

router.navigate("users", { id: "123" });
// URL: /app#!/users/123
```

## Router Extensions

The plugin extends the router instance with three methods via [`extendRouter()`](https://github.com/greydragon888/real-router/wiki/plugin-architecture):

| Method                                       | Returns              | Description                           |
| -------------------------------------------- | -------------------- | ------------------------------------- |
| `buildUrl(name, params?)`                    | `string`             | Build full URL with hash and prefix   |
| `matchUrl(url)`                              | `State \| undefined` | Parse hash URL to router state        |
| `replaceHistoryState(name, params?, title?)` | `void`               | Update browser URL without navigation |

```typescript
router.buildUrl("users", { id: "123" });
// => "#!/users/123" (with hashPrefix "!")

router.matchUrl("https://example.com/#!/users/123");
// => { name: "users", params: { id: "123" }, path: "/users/123" }

// Update URL silently (no transition, no guards)
router.replaceHistoryState("users", { id: "456" });
```

### `buildUrl` vs `buildPath`

```typescript
router.buildPath("users", { id: 1 }); // "/users/1"       — core, no hash
router.buildUrl("users", { id: 1 }); // "#!/users/1"     — plugin, with hash prefix
```

## Form Protection

Set `forceDeactivate: false` to respect `canDeactivate` guards on back/forward:

```typescript
router.usePlugin(hashPluginFactory({ forceDeactivate: false }));

import { getLifecycleApi } from "@real-router/core/api";

const lifecycle = getLifecycleApi(router);
lifecycle.addDeactivateGuard(
  "checkout",
  (router, getDep) => (toState, fromState) => {
    return !hasUnsavedChanges(); // false blocks back/forward
  },
);
```

## SSR Support

SSR-safe — automatically detects the environment and falls back to no-ops:

```typescript
router.usePlugin(hashPluginFactory());
router.buildUrl("home"); // returns hash path
router.matchUrl("/path"); // returns undefined
```

## Documentation

Full documentation: [Wiki — hash-plugin](https://github.com/greydragon888/real-router/wiki/hash-plugin)

- [Configuration Options](https://github.com/greydragon888/real-router/wiki/hash-plugin#3-configuration-options)
- [Behavior & Edge Cases](https://github.com/greydragon888/real-router/wiki/hash-plugin#8-behavior)

## Related Packages

| Package                                                                                  | Description                            |
| ---------------------------------------------------------------------------------------- | -------------------------------------- |
| [@real-router/core](https://www.npmjs.com/package/@real-router/core)                     | Core router (required peer dependency) |
| [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) | History API routing (clean URLs)       |
| [@real-router/react](https://www.npmjs.com/package/@real-router/react)                   | React integration                      |

## Contributing

See [contributing guidelines](../../CONTRIBUTING.md) for development setup and PR process.

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
