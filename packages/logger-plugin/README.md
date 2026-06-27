# @real-router/logger-plugin

[![Mutation Score](https://img.shields.io/endpoint?style=flat-square&url=https%3A%2F%2Fbadge-api.stryker-mutator.io%2Fgithub.com%2Fgreydragon888%2Freal-router%2Fmaster%3Fmodule%3Dlogger-plugin)](https://dashboard.stryker-mutator.io/reports/github.com/greydragon888/real-router/master?module=logger-plugin)
[![npm](https://img.shields.io/npm/v/@real-router/logger-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/logger-plugin)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/logger-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/logger-plugin)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/logger-plugin&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/logger-plugin&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Development logging plugin for [Real-Router](https://github.com/greydragon888/real-router). Transition timing, parameter diffs, Performance API marks, and log grouping.

```
[logger-plugin] Router started
▼ Router transition
  [logger-plugin] Transition: home → users.profile {from: {...}, to: {...}}
  [logger-plugin]   Changed: { id: "123" → "456" }, Added: {"sort":"name"}
  [logger-plugin] Leave approved {to: {...}, from: {...}}
  [logger-plugin] Transition success (1.23ms) {to: {...}, from: {...}}
```

## Installation

```bash
npm install @real-router/logger-plugin
```

**Peer dependency:** `@real-router/core`

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { loggerPluginFactory } from "@real-router/logger-plugin";

const router = createRouter(routes);
router.usePlugin(loggerPluginFactory());
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `level` | `"all" \| "transitions" \| "errors" \| "none"` | `"all"` | What to log |
| `showTiming` | `boolean` | `true` | Transition execution time (adaptive ms/μs) |
| `showParamsDiff` | `boolean` | `true` | Show param changes on same-route navigation |
| `usePerformanceMarks` | `boolean` | `false` | Create Performance API marks for DevTools |
| `context` | `string` | `"logger-plugin"` | Log prefix (useful for multiple routers) |

### Log Levels

| Level | Lifecycle (start/stop) | Transitions | Warnings (cancel) | Errors |
|-------|:-----:|:-----------:|:-------:|:------:|
| `"all"` | Yes | Yes | Yes | Yes |
| `"transitions"` | — | Yes | Yes | Yes |
| `"errors"` | — | — | — | Yes |
| `"none"` | — | — | — | — |

### Usage Examples

```typescript
// Multiple routers — distinguish by context
router.usePlugin(loggerPluginFactory({ context: "main-router" }));

// Performance profiling
router.usePlugin(loggerPluginFactory({ usePerformanceMarks: true }));

// Errors only (staging/production)
router.usePlugin(loggerPluginFactory({ level: "errors" }));
```

## Features

### Adaptive Timing

```
[logger-plugin] Transition success (15ms)       // normal
[logger-plugin] Transition success (27.29μs)    // fast (<0.1ms)
```

### Parameter Diff

Logs added, changed, and removed params when navigating within the same route:

```
[logger-plugin]   Changed: { id: "123" → "456" }, Added: {"sort":"name"}
```

### Performance API

With `usePerformanceMarks: true`, creates marks visible in DevTools Performance tab:

```
router:transition-start:{from}→{to}
router:leave-approved:{from}→{to}
router:transition-end:{from}→{to}
router:transition:{from}→{to}              (measure)
router:lifetime                             (measure: start → stop)
```

## Documentation

Full documentation: [Wiki — logger-plugin](https://github.com/greydragon888/real-router/wiki/logger-plugin)

- [Configuration Options](https://github.com/greydragon888/real-router/wiki/logger-plugin#3-configuration-options)
- [Performance Marks](https://github.com/greydragon888/real-router/wiki/logger-plugin#10-performance-marks-and-measures)
- [Migration from router5](https://github.com/greydragon888/real-router/wiki/logger-plugin#13-migration-from-router5)

## Related Packages

| Package | Description |
|---------|-------------|
| [@real-router/core](https://www.npmjs.com/package/@real-router/core) | Core router (required peer dependency) |
| [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) | Browser History API integration |

## Contributing

See [contributing guidelines](../../CONTRIBUTING.md) for development setup and PR process.

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
