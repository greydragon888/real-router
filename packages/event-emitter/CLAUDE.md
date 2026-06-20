# event-emitter

Internal package providing a generic typed event emitter for Real-Router. Not published to npm -- used by core for all internal eventing.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `EventEmitter<TEventMap>` | Class | Typed event emitter with opt-in limits and error isolation |
| `EventEmitterLimits` | Type | `{ maxListeners, warnListeners, maxEventDepth }` |
| `EventEmitterOptions` | Type | Constructor options (limits, onListenerError, onListenerWarn) |
| `Unsubscribe` | Type | `() => void` returned by `on()` |

## EventEmitter API

| Method | Description |
|--------|-------------|
| `on(event, cb)` | Subscribe; returns `Unsubscribe`. Throws on duplicate listener or limit exceeded |
| `off(event, cb)` | Remove a listener |
| `emit(event, ...args)` | Fire event to all listeners (snapshot iteration) |
| `clearAll()` | Remove all listeners and reset depth tracking |
| `listenerCount(event)` | Number of listeners for an event |
| `setLimits(limits)` | Replace current limits at runtime |
| `EventEmitter.validateCallback(cb, event)` | Static assertion that cb is a function |

## All Features Are Opt-In

Limits default to `{ maxListeners: 0, warnListeners: 0, maxEventDepth: 0 }` -- all zeros mean disabled. Pass non-zero values via constructor options to enable.

## Module Structure

```
src/
├── EventEmitter.ts  -- EventEmitter class (emit, on, off, depth tracking)
├── types.ts         -- EventEmitterLimits, EventEmitterOptions, Unsubscribe
└── index.ts         -- re-exports
```

## Gotchas

- **Duplicate listeners throw** -- calling `on()` with the same function reference twice for the same event throws an Error, not a silent no-op
- **`onListenerWarn` is latched, throw-first** -- the warning fires **exactly once per emitter+event** (off/on churn around the threshold does not re-fire; the latch is released by `clearAll()` or by removing the event's last listener). The `maxListeners` throw is checked **before** the warn, so a registration that hits the hard limit never warns (`warnListeners === maxListeners` → warn is unreachable)
- **`off()` releases the per-event record** -- when the last listener for an event is removed, the now-empty `Set` (and its warn latch) is deleted from the internal map; the depth-tracking `emit()` path likewise drops its `#depthMap` entry when recursion unwinds to 0. This prevents an unbounded heap leak for consumers with **dynamic event names** (`listenerCount()` returns 0 either way, so the leak was invisible to it). See #750
- **Snapshot iteration** -- `emit()` snapshots the listener set before iteration; listeners added/removed during emit do not affect the current invocation
- **Per-listener error isolation** -- listener exceptions are caught and forwarded to `onListenerError` callback (if provided); other listeners still execute. Exception: `RecursionDepthError` is always re-thrown — both emit paths (fast + depth-tracking) route through the shared `#handleListenerError`, so the sentinel cannot be swallowed on either (#751)
- **Explicit args, not rest params** -- `emit()` takes up to 4 explicit args to avoid V8 array materialization overhead; extra `undefined` args are harmless (JS ignores extra function arguments)
- **Fast path for single listener** -- when a set has exactly one listener, `emit` skips array spread for the snapshot
- **No dependencies** -- zero runtime dependencies; fully self-contained
- **Property-based tests** -- `tests/property/` contains fast-check generative tests for emitter invariants
- **Heap-stress tests** -- `tests/stress/` (`pnpm -F event-emitter test:stress`, runs with `--expose-gc`) guards against the dynamic-event-name heap leak (#750); thresholds are anchored to measured healthy vs leak deltas
