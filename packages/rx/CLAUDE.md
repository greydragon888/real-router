# @real-router/rx

> Reactive Observable API for Real-Router -- state$, events$, operators, and TC39 Observable support

## Exports

| Export                   | Kind     | Description                                                       |
| ------------------------ | -------- | ----------------------------------------------------------------- |
| `RxObservable`           | class    | TC39-compatible Observable with `subscribe()`, `pipe()`, `[Symbol.asyncIterator]()` |
| `state$`                 | function | Creates `RxObservable<SubscribeState>` from router state changes  |
| `events$`                | function | Creates `RxObservable<RouterEvent>` from all router events        |
| `observable`             | function | Semantic wrapper over `state$()` for RxJS `from()` interop       |
| `map`                    | operator | Transform emitted values                                         |
| `filter`                 | operator | Filter values by predicate                                       |
| `debounceTime`           | operator | Delay emissions by time window                                   |
| `distinctUntilChanged`   | operator | Skip consecutive duplicates                                      |
| `takeUntil`              | operator | Complete when notifier emits                                     |

### Types

| Type               | Description                                                    |
| ------------------ | -------------------------------------------------------------- |
| `Observer<T>`      | `{ next?, error?, complete? }`                                 |
| `Subscription`     | `{ unsubscribe(), closed }`                                    |
| `ObservableOptions`| `{ signal?, replay? }`                                         |
| `SubscribeFn<T>`   | Subscribe function: `(observer) => void \| (() => void)`       |
| `Operator<T, R>`   | `(source: RxObservable<T>) => RxObservable<R>`                 |
| `UnaryFunction<T, R>` | Generic transform                                           |
| `SubscribeState`   | Re-exported from core: `{ route, previousRoute }`              |
| `RouterEvent`      | Discriminated union of all router event types                  |

## Module Structure

```
src/
├── RxObservable.ts      -- Core class: subscribe(), pipe(), [Symbol.asyncIterator]()
├── state$.ts            -- state$(router, options?) -> RxObservable<SubscribeState>
├── events$.ts           -- events$(router) -> RxObservable<RouterEvent>
├── observable.ts        -- observable(router) wrapper for TC39 interop
├── operators/
│   ├── createOperator.ts   -- Shared operator factory
│   ├── map.ts              -- map(project)
│   ├── filter.ts           -- filter(predicate)
│   ├── debounceTime.ts     -- debounceTime(ms)
│   ├── distinctUntilChanged.ts -- distinctUntilChanged(comparator?)
│   ├── takeUntil.ts        -- takeUntil(notifier)
│   └── index.ts            -- Re-exports
├── types.ts             -- Observer, Subscription, Operator, etc.
└── index.ts             -- Public API re-exports
```

## Gotchas

### `state$` replays current state by default

`state$` emits the current router state via `queueMicrotask` on subscription when `replay: true` (default). Pass `{ replay: false }` to skip the initial emission.

### `events$` uses partial registration safety

Event listeners are registered one by one inside a try block. If any `addEventListener` throws, the catch block unsubscribes all already-registered listeners before re-throwing.

### `RxObservable.subscribe` catches errors in handlers

`next`, `error`, and `complete` callbacks are wrapped in try/catch. Errors in `next` are forwarded to `error`; errors in `error` and `complete` are swallowed silently.

### AbortSignal support

Pass `{ signal }` in subscribe options. If already aborted, returns immediately with `{ closed: true }`. Otherwise adds an abort listener that calls `unsubscribe()`.

### `pipe()` with zero operators returns `this`

Calling `.pipe()` without arguments returns the observable itself (identity).

### Async iterator yields latest value only

The `[Symbol.asyncIterator]()` implementation yields the most recent value when awaited. If multiple values arrive between yields, intermediate values are dropped (latest-wins).
