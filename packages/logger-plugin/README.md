# @real-router/logger-plugin

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

Console logging plugin for Real-Router. Provides transition timing, parameter diff tracking, Performance API integration, and log grouping.

## Installation

```bash
npm install @real-router/logger-plugin
# or
pnpm add @real-router/logger-plugin
# or
yarn add @real-router/logger-plugin
# or
bun add @real-router/logger-plugin
```

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { loggerPlugin } from "@real-router/logger-plugin";

const router = createRouter(routes);

// Use with default settings
router.usePlugin(loggerPlugin);

router.start();
```

**Console output:**

```
Router started
▼ Router transition
  Transition: home → users (1.23ms)
  Transition success (1.23ms)
```

---

## API

### `loggerPlugin`

Ready-to-use plugin instance with default settings.

```typescript
import { loggerPlugin } from "@real-router/logger-plugin";

router.usePlugin(loggerPlugin);
```

### `loggerPluginFactory()`

Factory for creating a new plugin instance.

```typescript
import { loggerPluginFactory } from "@real-router/logger-plugin";

router.usePlugin(loggerPluginFactory());
```

---

## Configuration

| Option                | Type       | Default                        | Description                                          |
| --------------------- | ---------- | ------------------------------ | ---------------------------------------------------- |
| `level`               | `LogLevel` | `"all"`                        | `"all"` \| `"transitions"` \| `"errors"` \| `"none"` |
| `showTiming`          | `boolean`  | `true`                         | Show transition execution time (μs/ms)               |
| `showParamsDiff`      | `boolean`  | `true`                         | Show param changes within same route                 |
| `usePerformanceMarks` | `boolean`  | `false`                        | Create Performance API marks for DevTools            |
| `context`             | `string`   | `"@real-router/logger-plugin"` | Log prefix for multiple routers                      |

See [Wiki](https://github.com/greydragon888/real-router/wiki/real-router-logger-plugin#3-configuration-options) for detailed descriptions.

---

## Features

### Timing Display

```
Transition success (15ms)      // normal
Transition success (27.29μs)   // fast (<0.1ms)
```

### Parameter Diff

When navigating within the same route:

```
▼ Router transition
  Transition: users.view → users.view
  Changed: { id: "123" → "456" }, Added: {"sort":"name"}
  Transition success (2.15ms)
```

### Performance API

With `usePerformanceMarks: true`, creates marks visible in DevTools Performance tab:

- `router:transition-start:{from}→{to}`
- `router:transition-end:{from}→{to}`
- `router:transition:{from}→{to}` (measure)

See [Wiki](https://github.com/greydragon888/real-router/wiki/real-router-logger-plugin#10-performance-marks-and-measures) for full list.

---

## SSR Support

For high-precision timing in Node.js:

```typescript
import { performance } from "perf_hooks";

if (typeof globalThis.performance === "undefined") {
  globalThis.performance = performance;
}
```

---

## Documentation

Full documentation on [Wiki](https://github.com/greydragon888/real-router/wiki/real-router-logger-plugin):

- [Configuration Options](https://github.com/greydragon888/real-router/wiki/real-router-logger-plugin#3-configuration-options)
- [Lifecycle Hooks](https://github.com/greydragon888/real-router/wiki/real-router-logger-plugin#4-lifecycle-hooks)
- [Performance Marks](https://github.com/greydragon888/real-router/wiki/real-router-logger-plugin#10-performance-marks-and-measures)
- [Migration from router5](https://github.com/greydragon888/real-router/wiki/real-router-logger-plugin#13-migration-from-router5)

---

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — Core router
- [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) — Browser history

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
