# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## State Transitions

| #   | Invariant           | Description                                                                                                                                                                              |
| --- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Validity            | After any sequence of `send()` calls, `getState()` always returns a value that belongs to the set of states defined in the config. The FSM can never enter a state that wasn't declared. |
| 2   | Determinism         | Two independent FSM instances created from the same config always reach the same state after the same event sequence. Any non-determinism would indicate hidden mutable state.           |
| 3   | Rejection           | Sending an event that has no transition defined for the current state leaves the state unchanged. Unknown events are silently ignored.                                                   |
| 4   | canSend correlation | `canSend(event)` returns `true` if and only if `send(event)` fires transition listeners. When `canSend` returns `false`, neither the state nor any listener is affected.                 |
| 5   | Initial state       | Immediately after construction, `getState()` equals `config.initial`. The initial state is fully predictable and independent of field initialization order.                              |

## Listener Lifecycle

| #   | Invariant   | Description                                                                                                                                                                        |
| --- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Ordering    | Listeners registered without intermediate unsubscribes are called in registration order (FIFO). Predictable ordering is required for logic that depends on side-effect sequencing. |
| 2   | Unsubscribe | After calling the unsubscribe function returned by `onTransition()`, the listener is never called again, regardless of how many transitions follow.                                |
| 3   | Clear all   | After unsubscribing every registered listener, no listener is called on subsequent transitions. This verifies the `#listenerCount` fast-path optimization.                         |
| 4   | Reentrancy  | Calling `send()` inside an `onTransition` listener does not corrupt FSM state. After the full reentrant call chain completes, `getState()` still returns a valid state.            |

## Self-Transitions

| #   | Invariant | Description                                                                                                                                                                                                                        |
| --- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Self-loop | When a transition maps a state back to itself (`from === to`), `getState()` remains unchanged but `onTransition` listeners are still called with correct `from`, `to`, and `event` fields. Self-transitions are observable events. |

## TransitionInfo

| #   | Invariant               | Description                                                                                                                                                                                                   |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | General transition info | For a general transition (`from !== to`), the `onTransition` listener receives a `TransitionInfo` with `from` equal to the source state, `to` equal to the target state, and `event` equal to the sent event. |

## Transition Actions

| #   | Invariant        | Description                                                                                                                                                |
| --- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Action ordering  | An action registered via `on(from, event, action)` fires before any `onTransition` listeners on the same transition.                                       |
| 2   | Action isolation | An action fires only when both `from` state and `event` match the registration pair. Transitions from other states or with other events do not trigger it. |
| 3   | Action overwrite | Registering a second action for the same `(from, event)` pair replaces the first. Only the latest action fires on the matching transition.                 |
| 4   | Action unsub     | The unsubscribe function returned by `on()` removes the action. After calling it, the action no longer fires on the matching transition.                   |

## Edge Cases

| #   | Invariant           | Description                                                                                                                                                                                             |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Idempotent unsub    | Calling the `onTransition` unsubscribe function multiple times is a no-op. It does not corrupt `#listenerCount` — remaining active listeners continue to fire correctly.                                |
| 2   | Exception semantics | State is updated before listeners fire. If a listener throws, `getState()` already reflects the new state. The exception propagates to the `send()` caller.                                             |
| 3   | Null-slot reuse     | After unsubscribing a listener and registering a new one, the new listener fills the vacated slot in the array. It fires at that position, potentially before listeners registered earlier.             |
| 4   | Return value        | `send()` returns `getState()` at the moment it returns. With reentrant `send()` inside a listener, the return value reflects the final state after all reentrant transitions, not the immediate target. |
| 5   | Context identity    | `getContext()` returns the exact same reference as `config.context`. The FSM does not clone or wrap the context object.                                                                                 |

## Test Files

| File                               | Invariants | Category                                                                                      |
| ---------------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| `tests/property/fsm.properties.ts` | 20         | State transitions, listener lifecycle, self-transitions, transition info, actions, edge cases |
| `tests/property/helpers.ts`        | —          | Shared arbitraries and FSM factory helpers                                                    |
