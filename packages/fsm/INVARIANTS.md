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
| 5   | Live iteration (no snapshot) | `send()` iterates the **live** listener array — it does **not** snapshot before iterating. A listener registered during a transition is invoked within that same `send()`; an unsubscribed listener is skipped via its null slot. This **diverges from the sibling `event-emitter`**, which snapshots the listener set before iterating. Consumers must not assume the two primitives share mutation-during-dispatch semantics. (`on()` **actions**, by contrast, are **single-captured** per `send` — read into a local before firing, so a reentrant action-overwrite during dispatch does not affect the current `send`; live iteration is listener-only.) |
| 6   | Churn integrity | After an arbitrary sequence of `onTransition`/unsubscribe operations, exactly the currently-live listeners fire on the next `send()`, in array-slot order (a vacated null slot is reused by a later subscription). |

## Self-Transitions

| #   | Invariant | Description                                                                                                                                                                                                                        |
| --- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Self-loop | When a transition maps a state back to itself (`from === to`), `getState()` remains unchanged but `onTransition` listeners are still called with correct `from`, `to`, and `event` fields. Self-transitions are observable events. |

## TransitionInfo

| #   | Invariant               | Description                                                                                                                                                                                                   |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | General transition info | For a general transition (`from !== to`), the `onTransition` listener receives a `TransitionInfo` with `from` equal to the source state, `to` equal to the target state, and `event` equal to the sent event. |
| 2   | Payload delivery        | `send(event, payload)` delivers the *same* `payload` value (by reference) to both the matching `on()` action and `TransitionInfo.payload`. |

## Transition Actions

| #   | Invariant        | Description                                                                                                                                                |
| --- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Action ordering  | An action registered via `on(from, event, action)` fires before any `onTransition` listeners on the same transition.                                       |
| 2   | Action isolation | An action fires only when both `from` state and `event` match the registration pair. Transitions from other states or with other events do not trigger it. |
| 3   | Action overwrite | Registering a second action for the same `(from, event)` pair replaces the first. Only the latest action fires on the matching transition.                 |
| 4   | Action unsub     | The unsubscribe function returned by `on()` removes the action. After calling it, the action no longer fires on the matching transition.                   |
| 5   | Stale unsub no-op | After an action is replaced by re-registering the same `(from, event)` **with a different function value**, calling the *original* action's unsubscribe is a no-op — the replacement still fires (removal is identity-guarded). Carve-out: re-registering the *exact same* callback value makes the two unsubscribes **aliases of one registration** (the identity guard cannot tell them apart), so either one removes the action. |
| 6   | Multi-action isolation | With actions registered on many distinct `(from, event)` pairs, over any event sequence each action fires exactly on its own matching transition and never on another's. |

## Edge Cases

| #   | Invariant           | Description                                                                                                                                                                                             |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Idempotent unsub    | Calling the `onTransition` unsubscribe function multiple times is a no-op. It does not corrupt `#listenerCount` — remaining active listeners continue to fire correctly.                                |
| 2   | Exception semantics | State is updated before listeners fire. If a listener throws, `getState()` already reflects the new state. The exception propagates to the `send()` caller.                                             |
| 3   | Null-slot reuse     | After unsubscribing a listener and registering a new one, the new listener fills the vacated slot in the array. It fires at that position, potentially before listeners registered earlier.             |
| 4   | Return value        | `send()` returns `getState()` at the moment it returns. With reentrant `send()` inside a listener, the return value reflects the final state after all reentrant transitions, not the immediate target. |
| 5   | Context identity    | `getContext()` returns the exact same reference as `config.context`. The FSM does not clone or wrap the context object.                                                                                 |
| 6   | Declared-state guard | Every state-entry-point — `new FSM({ initial })`, `on(from, …)`, and every transition **target** in the table (validated for closure at construction, #1159) — throws when the state is not declared in `config.transitions` (shared `requireDeclared`). Narrow-union callers cannot reach this (`TStates`); it hardens `string`-typed / JS / cast callers, mirroring `send()`'s no-op on unknown input (#754 originally the `forceState` guard; #885 constructor + `on`; #1159 table targets). A dangling target would otherwise brick the FSM on the first `send()` into it (violating Validity #1 / No-bricking #10). Post-construction mutation of the shared table stays a documented GIGO boundary (Edge #5). |
| 7   | Reentrant info staleness | When a listener **or action** performs a reentrant `send()`, an **outer** listener still receives `info.to` equal to *its own* transition's target, while `getState()` may already reflect a later (nested) state, and observations run in reverse-causal order (the nested transition is observed before the outer one completes). Listeners must **not** assume `info.to === getState()` under reentrancy. (Edge #4 covers `send()`'s **return value**; this covers the **`TransitionInfo`** seen by listeners.) |
| 8   | Action-throw abort | If an action throws, it propagates through `send()` and **no** `onTransition` listener runs (actions fire before listeners; there is no error isolation). `getState()` already reflects the transition. |
| 9   | Listener-throw abort | If an `onTransition` listener throws, listeners after it in slot order do **not** run (no per-listener `try/catch`). `getState()` already reflects the transition. |
| 10  | No bricking | After any sequence of `send`, the FSM stays consistent: `getState()` is always a declared state and `canSend()` never throws. |

> Every invariant above is covered by a dedicated property test (see the file table below). The earlier `†` carve-out for reentrancy / live-iteration ([#755](https://github.com/greydragon888/real-router/issues/755)) is now closed.

## Test Files

| File                               | Invariants | Category                                                                                      |
| ---------------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| `tests/property/fsm.properties.ts` | 32         | State transitions, listener lifecycle, self-transitions, transition info, actions, edge cases |
| `tests/property/helpers.ts`        | —          | Shared arbitraries and FSM factory helpers                                                    |
