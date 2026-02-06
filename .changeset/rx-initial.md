---
"@real-router/rx": minor
---

Initial release of @real-router/rx — reactive Observable API for Real-Router (#41)

New package providing zero-cost opt-in Observable functionality:

- `state$(router)` — reactive state stream with replay semantics
- `events$(router)` — typed event stream for all router events
- `observable(router)` — TC39 Observable wrapper for RxJS interop
- Operators: `map`, `filter`, `debounceTime`, `distinctUntilChanged`, `takeUntil`
- `pipe()` for operator composition (supports 1-9 operators)
- `Symbol.asyncIterator` for `for await...of` support
- AbortSignal support for automatic unsubscription
- Full TC39 Observable compliance with `Symbol.observable` and `@@observable`

**Design decisions:**

- `unsubscribe()` does not trigger `complete` callback — aligns with TC39 Observable spec
- `distinctUntilChanged` comparator receives `(previous, current)` matching RxJS convention
- `debounceTime` flushes pending value on source `complete`
- `debounceTime` validates duration parameter (throws RangeError on negative/NaN/Infinity)
- `filter` operator has type guard overload
- Unhandled errors reported via `console.error`

**Example:**

```typescript
import { state$, map, filter, distinctUntilChanged } from "@real-router/rx";

state$(router)
  .pipe(
    map(({ route }) => route.params.userId),
    filter((id) => id !== undefined),
    distinctUntilChanged(),
  )
  .subscribe((userId) => fetchUser(userId));
```
