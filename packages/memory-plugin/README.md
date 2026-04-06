# @real-router/memory-plugin

[![npm](https://img.shields.io/npm/v/@real-router/memory-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/memory-plugin)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/memory-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/memory-plugin)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/memory-plugin&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/memory-plugin&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> In-memory history stack for [Real-Router](https://github.com/greydragon888/real-router). Back/forward/go navigation without browser History API.

## Installation

```bash
npm install @real-router/memory-plugin
```

**Peer dependency:** `@real-router/core`

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { memoryPluginFactory } from "@real-router/memory-plugin";

const router = createRouter([
  { name: "home", path: "/" },
  { name: "users", path: "/users/:id" },
]);

router.usePlugin(memoryPluginFactory());
await router.start("/");

await router.navigate("users", { id: "1" });
await router.navigate("users", { id: "2" });

router.back(); // navigate to users/1
router.forward(); // navigate to users/2
router.go(-2); // navigate to home
```

## Options

```typescript
router.usePlugin(
  memoryPluginFactory({
    maxHistoryLength: 50, // Keep at most 50 entries
  }),
);
```

| Option             | Type     | Default | Description                                                   |
| ------------------ | -------- | ------- | ------------------------------------------------------------- |
| `maxHistoryLength` | `number` | `1000`  | Maximum entries. `0` = unlimited, negative throws `TypeError` |

## Router Extensions

The plugin extends the router instance with five methods via [`extendRouter()`](https://github.com/greydragon888/real-router/wiki/plugin-architecture):

| Method           | Returns   | Description                                                     |
| ---------------- | --------- | --------------------------------------------------------------- |
| `back()`         | `void`    | Navigate to the previous history entry                          |
| `forward()`      | `void`    | Navigate to the next history entry                              |
| `go(delta)`      | `void`    | Navigate by `delta` steps (negative = back, positive = forward) |
| `canGoBack()`    | `boolean` | `true` if there is a previous entry                             |
| `canGoForward()` | `boolean` | `true` if there is a next entry                                 |

All navigation methods are fire-and-forget (`void`). To detect completion, subscribe to state changes before calling.

```typescript
router.subscribe(({ route }) => {
  console.log("navigated to", route.name);
});

router.back();
```

Guards can block back/forward navigation. If a guard rejects, the history index stays unchanged and `canGoBack()`/`canGoForward()` continue to reflect the actual position.

## Use Cases

### React Native / non-browser environments

No `window.history` required. Drop in `memoryPluginFactory()` and get full back/forward support anywhere JavaScript runs.

### Testing and benchmarks

Deterministic navigation without browser globals. Start the router at any path, navigate programmatically, assert state.

```typescript
const router = createRouter(routes);
router.usePlugin(memoryPluginFactory());
await router.start("/");

await router.navigate("dashboard");
expect(router.canGoBack()).toBe(true);

router.back();
// wait for state change, then assert
```

### SSR navigation simulation

Simulate multi-step user flows on the server without a browser environment.

## Documentation

Full documentation: [Wiki — memory-plugin](https://github.com/greydragon888/real-router/wiki/memory-plugin)

## Related Packages

| Package                                                                                  | Description                            |
| ---------------------------------------------------------------------------------------- | -------------------------------------- |
| [@real-router/core](https://www.npmjs.com/package/@real-router/core)                     | Core router (required peer dependency) |
| [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) | Browser History API integration        |
| [@real-router/hash-plugin](https://www.npmjs.com/package/@real-router/hash-plugin)       | Hash-based routing (`#/path`)          |

## Contributing

See [contributing guidelines](../../CONTRIBUTING.md) for development setup and PR process.

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
