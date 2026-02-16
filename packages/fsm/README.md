# @real-router/fsm

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

Universal synchronous FSM engine for Real-Router. Zero dependencies, full TypeScript generics, O(1) transition lookup.

## Installation

```bash
npm install @real-router/fsm
# or
pnpm add @real-router/fsm
# or
yarn add @real-router/fsm
# or
bun add @real-router/fsm
```

## Quick Start

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

fsm.send("TIMER");     // "yellow"
fsm.send("TIMER");     // "red"
fsm.send("RESET");     // "green"
fsm.getState();         // "green"
fsm.getContext();        // { count: 0 }
```

---

## API

### `new FSM(config: FSMConfig<TStates, TEvents, TContext>)`

Creates a new FSM instance.\
`config.initial: TStates` — initial state\
`config.context: TContext` — shared context object\
`config.transitions: Record<TStates, Partial<Record<TEvents, TStates>>>` — transition table

### `fsm.send(event, payload?): TStates`

Sends an event to trigger a transition. Returns the current state after processing.\
If no transition exists for the event in the current state, returns the current state (no-op).\
State is updated before listeners fire (reentrancy-safe).

```typescript
fsm.send("TIMER");  // transitions and returns new state
fsm.send("RESET");  // no-op if no transition defined, returns current state
```

### `fsm.getState(): TStates`

Returns the current state.

### `fsm.getContext(): TContext`

Returns the context object (same reference as provided in config).

### `fsm.onTransition(listener): () => void`

Subscribes a listener to state transitions. Returns an unsubscribe function.\
Listener receives `TransitionInfo` with `from`, `to`, `event`, and `payload` fields.\
Not called on no-op sends (when no transition exists).

```typescript
const unsub = fsm.onTransition((info) => {
  console.log(`${info.from} -> ${info.to} via ${info.event}`);
});

fsm.send("TIMER");  // logs: "green -> yellow via TIMER"
unsub();
```

---

## Type-Safe Payloads

Use `TPayloadMap` to require payloads for specific events:

```typescript
import type { FSMConfig } from "@real-router/fsm";

type State = "idle" | "loading" | "done";
type Event = "FETCH" | "RESOLVE";

interface PayloadMap {
  FETCH: { url: string };
}

const config: FSMConfig<State, Event, null> = {
  initial: "idle",
  context: null,
  transitions: {
    idle:    { FETCH: "loading" },
    loading: { RESOLVE: "done" },
    done:    {},
  },
};

const fsm = new FSM<State, Event, null, PayloadMap>(config);

fsm.send("FETCH", { url: "/api" });  // OK — payload required
fsm.send("RESOLVE");                  // OK — no payload needed
fsm.send("FETCH");                    // TypeScript error — missing payload
```

---

## Types

```typescript
import type { FSMConfig, TransitionInfo } from "@real-router/fsm";

interface FSMConfig<TStates, TEvents, TContext> {
  initial: TStates;
  context: TContext;
  transitions: Record<TStates, Partial<Record<TEvents, TStates>>>;
}

interface TransitionInfo<TStates, TEvents, TPayloadMap> {
  from: TStates;
  to: TStates;
  event: TEvents;
  payload: TPayloadMap[TEvents] | undefined;
}
```

---

## Design

- **Synchronous** — no async, no promises, no microtasks
- **O(1) transitions** — cached current-state lookup, single property access per `send()`
- **Zero-alloc hot path** — when no listeners are registered, `send()` allocates nothing
- **Null-slot listener array** — `onTransition` reuses slots from unsubscribed listeners, preventing unbounded array growth
- **Reentrancy-safe** — `send()` inside a listener sees the updated state; callers are responsible for preventing infinite recursion

---

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — Core router

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
