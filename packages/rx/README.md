# @real-router/rx

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

Reactive Observable API for Real-Router. Zero-cost opt-in for reactive programming patterns.

## Installation

```bash
npm install @real-router/rx
# or
pnpm add @real-router/rx
# or
yarn add @real-router/rx
# or
bun add @real-router/rx
```

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { state$ } from "@real-router/rx";

const router = createRouter([
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
  { name: "users.profile", path: "/:id" },
]);

router.start();

// Subscribe to state changes
state$(router).subscribe(({ route, previousRoute }) => {
  console.log("Navigation:", previousRoute?.name, "→", route.name);
});
```

---

## API

### Streams

#### `state$(router, options?)`

Creates a reactive stream of router state changes.\
`router: Router` — router instance\
`options.signal?: AbortSignal` — for automatic unsubscription\
Returns: `RxObservable<{ route: State, previousRoute?: State }>`\
[Wiki](https://github.com/greydragon888/real-router/wiki/rx-package#state$router-options)

#### `events$(router)`

Creates a reactive stream of all router events.\
`router: Router` — router instance\
Returns: `RxObservable<RouterEvent>`\
[Wiki](https://github.com/greydragon888/real-router/wiki/rx-package#events$router)

#### `observable(router)`

Creates a TC39 Observable-compliant wrapper for RxJS interop.\
`router: Router` — router instance\
Returns: `RxObservable<SubscribeState>`\
[Wiki](https://github.com/greydragon888/real-router/wiki/rx-package#observablerouter)

---

### Operators

#### `map(project)`

Transforms emitted values.\
[Wiki](https://github.com/greydragon888/real-router/wiki/rx-package#mapt-rproject-value-t--r)

#### `filter(predicate)`

Filters values based on a predicate.\
[Wiki](https://github.com/greydragon888/real-router/wiki/rx-package#filtertpredicate-value-t--boolean)

#### `debounceTime(duration)`

Delays emissions, emitting only the last value.\
[Wiki](https://github.com/greydragon888/real-router/wiki/rx-package#debouncetimetduration-number)

#### `distinctUntilChanged(comparator?)`

Filters consecutive duplicate values.\
[Wiki](https://github.com/greydragon888/real-router/wiki/rx-package#distinctuntilchangedtcomparator-prev-t-curr-t--boolean)

#### `takeUntil(notifier)`

Completes stream when notifier emits.\
[Wiki](https://github.com/greydragon888/real-router/wiki/rx-package#takeuntiltnotifier-rxobservableany)

---

## Usage Examples

### Operator Pipeline

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

### Event Filtering

```typescript
import { events$, filter } from "@real-router/rx";

// Track navigation errors
events$(router)
  .pipe(filter((e) => e.type === "TRANSITION_ERROR"))
  .subscribe(({ error }) => {
    errorTracker.capture(error);
  });
```

### RxJS Interop

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

---

## Documentation

Full documentation available on the [Wiki](https://github.com/greydragon888/real-router/wiki/rx-package):

- [API Reference](https://github.com/greydragon888/real-router/wiki/rx-package#api-reference)
- [Operators](https://github.com/greydragon888/real-router/wiki/rx-package#operators)
- [Async Iteration](https://github.com/greydragon888/real-router/wiki/rx-package#async-iteration)
- [Migration Guide](https://github.com/greydragon888/real-router/wiki/rx-package#migration-guide)

---

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — Core router
- [@real-router/react](https://www.npmjs.com/package/@real-router/react) — React integration
- [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) — Browser history

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
