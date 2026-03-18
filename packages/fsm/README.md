# @real-router/fsm

> Synchronous finite state machine engine.

**Internal package** — consumed by `@real-router/core`. Published to npm by historical accident — do not depend on it directly.

## Purpose

Drives the router's lifecycle state machine (`STOPPED → STARTED → DISPOSED`). Synchronous, zero-dependency, O(1) transition lookup.

## Consumer

- `@real-router/core` — router lifecycle management

## Public API

```typescript
import { FSM } from "@real-router/fsm";

const fsm = new FSM({
  initial: "green",
  context: { count: 0 },
  transitions: {
    green:  { TIMER: "yellow" },
    yellow: { TIMER: "red" },
    red:    { TIMER: "green", RESET: "green" },
  },
});

fsm.send("TIMER");      // "yellow"
fsm.send("TIMER");      // "red"
fsm.getState();          // "red"
fsm.getContext();         // { count: 0 }
```

| Method | Description |
|--------|-------------|
| `send(event, payload?)` | Trigger transition, return current state. No-op if no transition defined |
| `getState()` | Current state |
| `getContext()` | Context object (same reference as config) |
| `onTransition(listener)` | Subscribe to transitions, returns unsubscribe |
| `on(from, event, action)` | Register action for specific `(from, event)` pair |
| `forceState(state)` | Direct state update — no actions, no listeners |

### Type-Safe Payloads

```typescript
interface PayloadMap {
  FETCH: { url: string };
}

const fsm = new FSM<State, Event, null, PayloadMap>(config);
fsm.send("FETCH", { url: "/api" }); // required
fsm.send("RESOLVE");                 // no payload
fsm.send("FETCH");                   // TS error
```

## Key Design Decisions

- **Synchronous** — no async, no promises, no microtasks
- **`#currentTransitions` cache** — avoids double lookup `transitions[state][event]`
- **Zero-alloc hot path** — skips `TransitionInfo` allocation when no listeners
- **Null-slot listener array** — reuses slots from unsubscribed listeners
- **Reentrancy-safe** — state updated before listeners fire; callers responsible for preventing loops
- **`forceState()`** — bypasses `send()` overhead (~30ns saved per call) for router's navigate hot path

## Dependencies

None (zero dependencies).

## License

[MIT](../../LICENSE)
