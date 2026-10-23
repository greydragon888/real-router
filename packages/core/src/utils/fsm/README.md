# FSM (`core/src/utils/fsm`)

> Synchronous finite state machine engine.

**Internal module of `@real-router/core`**, not a package. The `@real-router/fsm` package on npm is not built from this source — do not depend on it.

## Purpose

Drives the router's lifecycle state machine (`IDLE → STARTING → READY → TRANSITION_STARTED → LEAVE_APPROVED → READY | DISPOSED`). Synchronous, zero-dependency, O(1) transition lookup.

## Consumer

- `@real-router/core` — router lifecycle management

## Public API

```typescript
import { FSM } from "./utils/fsm"; // from a module in packages/core/src

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
| `send(event, payload?)` | Trigger transition, return current state. No-op if no transition is defined or its `when` refuses |
| `canSend(event, payload?)` | Whether `send` would fire from the current state: a transition is defined and its `when` accepts |
| `getState()` | Current state |
| `getContext()` | Context object (same reference as config) |
| `onTransition(listener)` | Subscribe to transitions, returns unsubscribe |
| `on(from, event, action)` | Register action for specific `(from, event)` pair |

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

## Dependencies

None (zero dependencies).

## License

[MIT](../../../LICENSE)
