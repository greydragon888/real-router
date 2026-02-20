# event-emitter

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

> Generic typed event emitter with listener limits, recursion depth protection, and per-listener error isolation.

**⚠️ Internal Use Only:** This package is designed for use within the Real-Router monorepo. External users should use `@real-router/core` package directly.

## Overview

`event-emitter` provides a lightweight, type-safe event emitter:

- **Type-safe events** — generic `TEventMap` ensures correct argument types per event
- **Listener limits** — configurable `maxListeners` with warning threshold
- **Recursion depth protection** — prevents infinite emit loops
- **Per-listener error isolation** — one failing listener doesn't break others
- **Snapshot iteration** — listeners added/removed during emit don't affect the current invocation
- **Duplicate detection** — throws on duplicate listener registration

## API

### `new EventEmitter<TEventMap>(options?)`

Creates a typed event emitter.

```typescript
import { EventEmitter } from "event-emitter";

type Events = {
  start: [];
  data: [payload: string];
  error: [error: Error, context: string];
};

const emitter = new EventEmitter<Events>({
  onListenerError: (eventName, error) => {
    console.error(`Error in ${eventName} listener:`, error);
  },
});
```

**Options:**

```typescript
interface EventEmitterOptions {
  limits?: EventEmitterLimits;
  onListenerError?: (eventName: string, error: unknown) => void;
  onListenerWarn?: (eventName: string, count: number) => void;
}

interface EventEmitterLimits {
  maxListeners: number;   // 0 = unlimited
  warnListeners: number;  // 0 = no warning
  maxEventDepth: number;  // 0 = no depth tracking
}
```

---

### `emitter.on(eventName, callback)`

Adds a listener and returns an unsubscribe function. Throws on duplicate listeners or when `maxListeners` is reached.

```typescript
const unsubscribe = emitter.on("data", (payload) => {
  console.log(payload); // type: string
});

unsubscribe(); // remove listener
```

---

### `emitter.off(eventName, callback)`

Removes a listener by reference.

```typescript
const handler = (payload: string) => console.log(payload);
emitter.on("data", handler);
emitter.off("data", handler);
```

---

### `emitter.emit(eventName, ...args)`

Emits an event, calling all registered listeners. Arguments are type-checked against `TEventMap`.

```typescript
emitter.emit("start");
emitter.emit("data", "hello");
emitter.emit("error", new Error("fail"), "context");
```

---

### `emitter.clearAll()`

Removes all listeners for all events and resets depth tracking.

---

### `emitter.listenerCount(eventName)`

Returns the number of listeners for the given event.

---

### `emitter.setLimits(limits)`

Replaces current limits configuration.

---

### `EventEmitter.validateCallback(cb, eventName)`

Static method. Asserts that `cb` is a function, throws `TypeError` otherwise.

## Performance

- **Dual-path emit** — fast path without depth tracking when `maxEventDepth === 0`
- **Switch by args.length** — direct calls for 0-3 args, avoids `Function.prototype.apply`
- **Lazy depth map** — `null` until first emit with depth tracking enabled
- **Set-based listeners** — O(1) add, remove, and duplicate detection

## Type Exports

```typescript
import type {
  EventEmitterLimits,
  EventEmitterOptions,
  Unsubscribe,
} from "event-emitter";
```

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — core router (uses event-emitter internally via EventBusNamespace)

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
