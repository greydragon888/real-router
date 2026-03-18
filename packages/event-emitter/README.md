# event-emitter

> Typed event emitter with listener limits, recursion protection, and per-listener error isolation.

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
| `emit(event, a?, b?, c?, d?)` | Emit event, up to 4 args |
| `clearAll()` | Remove all listeners, reset depth tracking |
| `listenerCount(event)` | Number of listeners for event |
| `setLimits(limits)` | Replace limits config |

### Options

```typescript
interface EventEmitterOptions {
  limits?: {
    maxListeners: number;   // 0 = unlimited
    warnListeners: number;  // 0 = no warning
    maxEventDepth: number;  // 0 = no depth tracking
  };
  onListenerError?: (eventName: string, error: unknown) => void;
  onListenerWarn?: (eventName: string, count: number) => void;
}
```

## Key Design Decisions

- **Zero-alloc emit** — explicit params `(a?, b?, c?, d?)` instead of rest params to avoid V8 array materialization
- **Single-listener fast path** — skips `[...set]` snapshot when only one listener
- **Dual-path emit** — fast path without depth tracking when `maxEventDepth === 0`
- **Switch by argc** — direct calls for 0-4 args, no `Function.prototype.apply`
- **Null-slot listener array** — reuses slots from unsubscribed listeners
- **Snapshot iteration** — listeners added/removed during emit don't affect current invocation
- **Per-listener error isolation** — one failing listener doesn't break others

## Dependencies

None (zero dependencies).

## License

[MIT](../../LICENSE)
