# @real-router/fsm

> Synchronous finite state machine engine (107 LOC)

## Architecture

Single-class design: `FSM<TStates, TEvents, TContext, TPayloadMap>`.

```
src/
├── fsm.ts    — FSM class (all logic)
├── types.ts  — FSMConfig, TransitionInfo, TransitionListener
└── index.ts  — public exports (FSM class + types)
```

### Hot-Path Optimizations

| Optimization | Purpose |
|---|---|
| `#currentTransitions` cache | O(1) event lookup — avoids `transitions[state][event]` double lookup |
| `#listenerCount` fast-path | Skips listener iteration + `TransitionInfo` allocation when count is 0 |
| Lazy `#actions` (`null`) | No Map allocation when `on()` not used — zero-cost for non-action consumers |
| Null-slot listener array | `onTransition` reuses slots from unsubscribed listeners instead of growing array |

### Transition Flow

```
send(event, payload?)
  ├── lookup: #currentTransitions[event]
  ├── if undefined → return #state (no-op, no actions/listeners fired)
  ├── update: #state = nextState
  ├── update: #currentTransitions = transitions[nextState]
  ├── if #actions !== null → lookup & call action for (from, event)
  ├── if #listenerCount > 0 → build TransitionInfo, iterate listeners
  └── return #state (may differ from nextState if reentrant send occurred)
```

### Reentrancy

`send()` inside `onTransition` listener is allowed. State is updated **before** listeners fire, so reentrant `send()` reads the already-updated state. No queue — reentrant calls execute synchronously inline.

Callers are responsible for preventing infinite loops.

### Exception Semantics

If a listener throws, the exception propagates to the `send()` caller. State is already updated before listeners fire, so `getState()` reflects the new state even if the exception escapes.

## Key Concepts

### Type-Safe Payloads

`TPayloadMap` maps events to required payload types:

```typescript
interface PayloadMap {
  FETCH: { url: string };  // FETCH requires payload
  // DONE not listed → no payload allowed
}

fsm.send("FETCH", { url: "/api" }); // required
fsm.send("DONE");                   // no payload
fsm.send("FETCH");                  // TS error
fsm.send("DONE", { x: 1 });        // TS error
```

Default `TPayloadMap = Record<never, never>` — all events are payload-free.

### Transition Actions (`on()`)

`on(from, event, action)` registers a specific action for a `(from, event)` pair:

```typescript
fsm.on("idle", "FETCH", (payload) => {
  console.log(payload.url); // type-safe — inferred from TPayloadMap
});
```

- **Key format**: nested `Map<TStates, Map<TEvents, action>>` — O(1) lookup, no string concatenation
- **Single action per key**: second `on()` for the same `(from, event)` overwrites the first
- **Execution order**: actions fire **before** `onTransition` listeners — actions are transition effects, listeners are generic observers
- **Lazy initialization**: `#actions` Map is `null` until first `on()` call
- **Returns unsubscribe function**: `const unsub = fsm.on(...); unsub();`

### Direct State Update (`forceState()`)

`forceState(state)` updates `#state` and `#currentTransitions` directly without dispatching actions or notifying listeners. Used by router's navigate hot path to bypass `send()` overhead (~30ns saved per call).

**Contract:** No actions, no listeners, no validation. Caller is responsible for maintaining state consistency.

### Self-Transitions

When `from === to`, `onTransition` still fires and `#currentTransitions` is reassigned (same reference). This is intentional — self-transitions are observable events.

### Context

`getContext()` returns the same reference passed in `config.context`. External mutations are reflected. FSM does not manage context lifecycle.

## Gotchas

### No Validation

FSM trusts the config. No runtime checks for:
- Invalid initial state
- Missing transition entries
- Event name typos (TypeScript catches these at compile time)

### No-Op Returns Current State

`send()` on an unknown event returns current state without firing listeners. Check return value to detect no-ops.

### Listener Order After Unsubscribe

Null-slot reuse means new listeners may execute **before** older ones if they fill a vacated slot.

## Code Conventions

- All fields are `#private` (true encapsulation)
- `readonly` on immutable fields (`#context`, `#transitions`, `#listeners` array ref)
- No validation — TypeScript generics enforce correctness at compile time
- 100% test coverage required
