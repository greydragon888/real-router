# @real-router/rx

[![npm](https://img.shields.io/npm/v/@real-router/rx.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/rx)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/rx.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/rx)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/rx&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/rx&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Reactive Observable API for [Real-Router](https://github.com/greydragon888/real-router). State streams, event streams, built-in operators, TC39 Observable and RxJS interop. Zero-cost opt-in — only bundled when imported.

## Installation

```bash
npm install @real-router/rx
```

**Peer dependency:** `@real-router/core`

## Quick Start

```typescript
import { state$, map, filter, distinctUntilChanged } from "@real-router/rx";

state$(router)
  .pipe(
    map(({ route }) => route.params.categoryId),
    filter((id) => id !== undefined),
    distinctUntilChanged(),
  )
  .subscribe((categoryId) => {
    loadCategory(categoryId);
  });
```

## Streams

| Factory | Returns | Description |
|---------|---------|-------------|
| `state$(router, options?)` | `RxObservable<{ route, previousRoute }>` | Router state changes |
| `events$(router)` | `RxObservable<RouterEvent>` | All router events (start, stop, transition, error, cancel) |
| `observable(router)` | `RxObservable<SubscribeState>` | TC39 Observable-compliant wrapper for RxJS interop |

`state$` accepts `{ signal: AbortSignal }` for automatic unsubscription.

## Operators

| Operator | Description |
|----------|-------------|
| `map(project)` | Transform emitted values |
| `filter(predicate)` | Filter values by predicate |
| `debounceTime(ms)` | Emit only the last value after a delay |
| `distinctUntilChanged(cmp?)` | Skip consecutive duplicates |
| `takeUntil(notifier)` | Complete when notifier emits |

All operators are composable via `.pipe()`:

```typescript
state$(router).pipe(
  filter(({ route }) => route.name.startsWith("admin")),
  debounceTime(100),
).subscribe(({ route }) => {
  analytics.trackPage(route.name);
});
```

## Event Filtering

```typescript
import { events$, filter } from "@real-router/rx";

events$(router)
  .pipe(filter((e) => e.type === "TRANSITION_ERROR"))
  .subscribe(({ error }) => {
    errorTracker.capture(error);
  });
```

## RxJS Interop

`observable()` returns a TC39-compliant Observable — pass it to RxJS `from()`:

```typescript
import { from } from "rxjs";
import { debounceTime } from "rxjs/operators";
import { observable } from "@real-router/rx";

from(observable(router))
  .pipe(debounceTime(100))
  .subscribe(({ route }) => {
    console.log("Route:", route.name);
  });
```

## Documentation

Full documentation: [Wiki — rx](https://github.com/greydragon888/real-router/wiki/rx-package)

- [API Reference](https://github.com/greydragon888/real-router/wiki/rx-package#api-reference)
- [Operators](https://github.com/greydragon888/real-router/wiki/rx-package#operators)
- [Async Iteration](https://github.com/greydragon888/real-router/wiki/rx-package#async-iteration)
- [Migration Guide](https://github.com/greydragon888/real-router/wiki/rx-package#migration-guide)

## Related Packages

| Package | Description |
|---------|-------------|
| [@real-router/core](https://www.npmjs.com/package/@real-router/core) | Core router (required peer dependency) |
| [@real-router/sources](https://www.npmjs.com/package/@real-router/sources) | `useSyncExternalStore`-based alternative |
| [@real-router/react](https://www.npmjs.com/package/@real-router/react) | React integration |

## Contributing

See [contributing guidelines](../../CONTRIBUTING.md) for development setup and PR process.

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
