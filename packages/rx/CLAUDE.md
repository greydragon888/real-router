# @real-router/rx

> Reactive Observable API for Real-Router -- state$, events$, operators, and TC39 Observable support

## Exports

| Export                   | Kind     | Description                                                       |
| ------------------------ | -------- | ----------------------------------------------------------------- |
| `RxObservable`           | class    | TC39-style Observable with `subscribe()`, `pipe()`, `[Symbol.asyncIterator]()` |
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

`state$` emits the current router state via `queueMicrotask` on subscription when `replay: true` (default). Pass `{ replay: false }` to skip the initial emission. A `sawEvent` guard suppresses the replay when a synchronous navigation fires `TRANSITION_SUCCESS` in the subscribe→microtask window (#771) — the live event already delivered a fresher snapshot, so the deferred replay must yield to it rather than emit the captured (now stale) state out of chronological order.

### `events$` uses partial registration safety

Event listeners are registered one by one inside a try block. If any `addEventListener` throws, the catch block unsubscribes all already-registered listeners before re-throwing.

### `RxObservable.subscribe` catches errors in handlers

`next`, `error`, and `complete` callbacks are wrapped in try/catch. Errors in `next` are forwarded to the `error` handler; errors thrown **inside** the `error` and `complete` handlers are swallowed silently. If a stream emits `error()` but the observer supplies **no** `error` handler, the error is logged via `console.error("Unhandled error in RxObservable:", err)` rather than thrown — it never reaches a global error handler.

### Errors are non-terminal — divergence from TC39 / RxJS

`@real-router/rx` exposes a **TC39-style** Observable interface, but deliberately diverges on one point: `error()` is **not terminal**. It does not set `closed`, so:

- values emitted after an `error()` are still delivered;
- multiple `error()` calls are each forwarded to the handler;
- a synchronous `throw` from the subscribe function reaches the `error` handler but leaves `closed: false`.

Only `complete()` and `unsubscribe()` are terminal (they run teardown — see below). Rationale: `state$`/`events$` are **infinite** router streams, so one throwing subscriber must not permanently kill the stream for everyone — the same isolation philosophy as `@real-router/sources` `notify()`. A consumer wrapping `from(observable(router))` in RxJS must not rely on `error` completing the stream. Pinned by `tests/stress/error-cascade.stress.ts` and `tests/property/subscription.properties.ts` (invariant 6). (#775)

### AbortSignal support

Pass `{ signal }` in subscribe options. If already aborted, returns immediately with `{ closed: true }`. Otherwise adds an abort listener that calls `unsubscribe()`.

### Terminal teardown runs on `complete()`, not just `unsubscribe()`

When a stream completes, the subscription's teardown runs and the abort listener is removed via a shared `finalize()` — so a self-completing source (intervals, DOM listeners, finite producers) releases its resource. `unsubscribe()` after `complete()` is a no-op because teardown already ran (exactly once). A **synchronous** `complete()` inside the subscribe function fires `finalize()` before `teardown` is assigned, so a post-subscribe `if (closed) finalize()` runs it once the subscribe function has returned. `error` is intentionally **non-terminal** (does not set `closed`, does not finalize) — resources release on the consumer's `unsubscribe()`. (#772)

### `pipe()` with zero operators returns `this`

Calling `.pipe()` without arguments returns the observable itself (identity).

### Async iterator yields latest value only

The `[Symbol.asyncIterator]()` implementation yields the most recent value when awaited. If multiple values arrive between yields, intermediate values are dropped (latest-wins). The **terminal batch** is preserved, though: a value emitted immediately before a synchronous `complete()` is still yielded, and a synchronous `error()` is thrown — the buffered value is drained before the terminal is honored (#774).
