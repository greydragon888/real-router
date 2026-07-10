# event-emitter

[![Mutation Score](https://img.shields.io/endpoint?style=flat-square&url=https%3A%2F%2Fbadge-api.stryker-mutator.io%2Fgithub.com%2Fgreydragon888%2Freal-router%2Fmaster%3Fmodule%3Devent-emitter)](https://dashboard.stryker-mutator.io/reports/github.com/greydragon888/real-router/master?module=event-emitter)

> Typed event emitter with listener limits, re-entrancy coalescing, and per-listener error isolation.

**Internal package** — consumed by `@real-router/core`. Not published to npm.

## Purpose

Lightweight, type-safe event emitter powering the router's internal event system (`EventBusNamespace`). Designed for high-frequency emit paths with zero-allocation optimizations.

## Consumer

- `@real-router/core` — router event bus (transition events, lifecycle events)

## Public API

```typescript
import { EventEmitter } from "event-emitter";

type Events = {
  start: [];
  data: [payload: string];
  error: [error: Error, context: string];
};

const emitter = new EventEmitter<Events>({
  onListenerError: (eventName, error) => { /* isolated */ },
});

const unsub = emitter.on("data", (payload) => { /* typed */ });
emitter.emit("data", "hello");
unsub();

emitter.listenerCount("data"); // 0
emitter.clearAll();
```

| Method | Description |
|--------|-------------|
| `on(event, callback)` | Add listener, returns unsubscribe. Throws on duplicate |
| `off(event, callback)` | Remove listener by reference |
| `emit(event, a?, b?, c?, d?)` | Emit event, up to 4 args. Re-entrant same-event emit is coalesced (no-op) |
| `clearAll()` | Remove all listeners, reset the warn latch |
| `listenerCount(event)` | Number of listeners for event |
| `isDispatching(event)` | Whether the event is currently being dispatched (in-flight) |
| `setLimits(limits)` | Replace limits config |

### Options

```typescript
interface EventEmitterOptions {
  limits?: {
    maxListeners: number;   // 0 = unlimited
    warnListeners: number;  // 0 = no warning
  };
  onListenerError?: (eventName: string, error: unknown) => void;
  onListenerWarn?: (eventName: string, count: number) => void;
}
```

## Key Design Decisions

- **Zero-alloc emit** — explicit params `(a?, b?, c?, d?)` instead of rest params to avoid V8 array materialization
- **Single-listener fast path** — skips `[...set]` snapshot when only one listener
- **Re-entrancy coalescing** — a re-entrant emit of the event already being dispatched is a no-op (depth ≤ 1); no depth bound, no stack-overflow path
- **Switch by argc** — direct calls for 0-4 args, no `Function.prototype.apply`
- **Set-based listeners** — each event's listeners live in a `Set` (O(1) add/remove/has, identity dedup); the empty `Set` is released when the last listener unsubscribes (#750)
- **Snapshot iteration** — listeners added/removed during emit don't affect current invocation
- **Per-listener error isolation** — one failing listener doesn't break others

## Dependencies

None (zero dependencies).

## License

[MIT](../../LICENSE)
