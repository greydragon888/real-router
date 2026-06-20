# @real-router/fsm

Generic synchronous finite-state-machine engine. **Public package** (published to npm) — the only foundation primitive that ships standalone. Core builds `routerFSM` on top of it (`packages/core/src/fsm/routerFSM.ts`). Zero runtime dependencies.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `FSM<TStates, TEvents, TContext, TPayloadMap?>` | Class | The state machine engine |
| `FSMConfig` | Type | Constructor config: `{ initial, context, transitions }` |
| `TransitionInfo` | Type | Payload passed to `onTransition` listeners: `{ from, to, event, payload }` |

`TransitionListener` is **internal** (`types.ts`) and not re-exported.

## Generic parameters

| Param | Meaning |
|-------|---------|
| `TStates extends string` | State name union |
| `TEvents extends string` | Event name union |
| `TContext` | Arbitrary read-only context value, returned by `getContext()` |
| `TPayloadMap extends Partial<Record<TEvents, unknown>>` | Optional per-event payload types (defaults to none) |

## FSM API

| Method | Description |
|--------|-------------|
| `send(event, payload?)` | Dispatch an event. Returns the resulting state. Unknown transition from the current state is a **no-op** (returns the current state unchanged). Fires the matching action then all `onTransition` listeners |
| `canSend(event)` | `true` if the current state declares a transition for `event`. O(1) via the cached `#currentTransitions` |
| `forceState(state)` | Set state directly, bypassing actions/listeners. Hot-path escape hatch — caller owns side effects |
| `getState()` | Current state |
| `getContext()` | The context value (shared by reference — see Gotchas) |
| `on(from, event, action)` | Register an action for `(from-state, event)`. Returns unsubscribe. One action per `(from, event)` — re-registering overwrites (last-write-wins) |
| `onTransition(listener)` | Subscribe to every transition. Returns unsubscribe |

## Config

```ts
new FSM({
  initial: "idle",
  context: someValue,
  transitions: {
    idle:    { start: "running" },
    running: { stop: "idle", tick: "running" }, // self-transition
    // a state with `{}` is terminal — canSend() is always false there
  },
});
```

`transitions[state][event] = nextState`. The set of declared state keys is the FSM's universe of states.

## Gotchas

- **`send()` payload is type-correlated to the event (symmetric with `on`)** — `send<E extends TEvents>(event, ...payload)` indexes by the *specific* event `E`, not the full union: `send("E1", payloadForE2)` is a type error, a payload event's payload is **required** (`send("FETCH")` errors), and a no-payload event rejects any payload (`send("START", {})` errors). Resolved in [#753](https://github.com/greydragon888/real-router/issues/753) — previously `send(event: TEvents, payload?: TPayloadMap[TEvents])` indexed by the full `TEvents` union (effectively `unknown`), so any payload compiled. Runtime is unchanged; the fix is type-level only. (Dormant for core: `RouterPayloads` is empty.)
- **`forceState()` throws on an undeclared state** — passing a state not in `config.transitions` throws `[FSM.forceState] state "…" is not declared in config.transitions`. The guard runs **before** any mutation, so a rejected call leaves the FSM in its prior valid state. The type signature forbids undeclared states in typed code; the guard hardens JS callers / casts, mirroring `send()`'s defensiveness on unknown input. Resolved in [#754](https://github.com/greydragon888/real-router/issues/754) — previously the undeclared state silently left `#currentTransitions` `undefined`, so the **next** `canSend`/`send` threw a cryptic `TypeError`.
- **`forceState()` bypasses actions and listeners** — by design. It's a hot-path optimization (core uses it for `NAVIGATE`/`COMPLETE`/`LEAVE_APPROVE`); the caller is responsible for any side effects `send()` would have fired.
- **Reentrancy is unbounded** — calling `send()` from inside an `onTransition` listener (or an action) is allowed and not depth-limited; the caller must prevent infinite loops. State is updated **before** listeners fire, so `getState()` reflects the new state even if a listener throws. Under a reentrant `send`, a listener's `info.to` reflects *its own* transition's target while `getState()` reflects the final state after the nested transition — **do not assume `info.to === getState()`** in reentrant listeners. See [#755](https://github.com/greydragon888/real-router/issues/755).
- **No listener snapshot (differs from `event-emitter`)** — `send()` iterates the **live** `#listeners` array, so a listener added during a `send` *is* called within that same `send`, and a freed null slot is reused at its original position (changing fire order). The sibling `event-emitter` primitive snapshots the listener set before iterating — the two repo primitives intentionally differ here. See [#755](https://github.com/greydragon888/real-router/issues/755).
- **Listener exceptions propagate** — unlike `event-emitter` (per-listener `try/catch` + `onListenerError`), `FSM` has no error isolation; a throwing `onTransition` listener escapes `send()` to the caller (state already updated).
- **`context` and `transitions` are shared by reference** — `getContext()` returns the same object passed in config; the engine never mutates it. Pass an immutable/owned value if identity matters.
- **One action per `(from, event)`** — `on()` overwrites a prior action for the same state+event pair (last-write-wins), unlike `onTransition` which appends.

## Module Structure

```
src/
├── fsm.ts    -- FSM class (send, canSend, forceState, on, onTransition, getState, getContext)
├── types.ts  -- FSMConfig, TransitionInfo, TransitionListener (internal)
└── index.ts  -- public re-exports (FSM, FSMConfig, TransitionInfo)
```

## Tests

- `tests/functional/` — unit tests
- `tests/property/` — fast-check generative tests (`arbFSMConfig` builds arbitrary transition tables); see `INVARIANTS.md` for the invariant catalogue (state-transition determinism, listener reentrancy/validity, terminal states, `TransitionInfo` shape, action dispatch)
- `tests/benchmarks/` — hot-path benchmarks (`send`/`canSend`/`forceState`)
- **No `tests/stress/` — intentional, not a gap.** The FSM has no unbounded-growth path, so a heap-threshold stress test would lack discriminating power (the "theatre" the root [CLAUDE.md](../../CLAUDE.md) stress-test doctrine warns about). Every structure is bounded:
  - `#listeners` is bounded by **peak** concurrent listeners (null-slot reuse via `indexOf(null)`); its only memory-discriminable behavior — staying bounded under churn — rides the *same* code path as the reuse-correctness property (`INVARIANTS.md` → Listener "Churn integrity"), already mutation-validated (force-append breaks order **and** growth together). A stress test would be redundant.
  - `#actions` is **hard-capped** at `|states| × |events|` (last-write-wins; unsub `delete`s) → KB-scale, below the heap noise floor → no signal to threshold against.
  - `send` rest-args / `TransitionInfo` are transient → GC-reclaimed (GC-masked, invisible to heap snapshots). That's GC-pressure/throughput, owned by `tests/benchmarks/` (`2.5` churn cycles, `2.7` reentrant ×1000, `2.3/2.4` 100/1000 listeners — all with `--expose-gc`).
  - Synchronous & single-threaded → no async/concurrency race surface.
  - Contrast: sibling `event-emitter` *does* ship `tests/stress/` because it holds listener **records** needing explicit release (a real leak class, #752); the FSM's `#listeners[index] = null` releases the ref directly, so that surface doesn't exist here. The lone unbounded path is **misuse** — `on(undeclaredFrom, …)` keeps one never-deleted inner Map per distinct undeclared `from` — a guard candidate (à la #754), **not** a stress test.

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — engine internals and design decisions
- [INVARIANTS.md](INVARIANTS.md) — invariant catalogue (basis for property tests)
- [packages/core/src/fsm/routerFSM.ts](../core/src/fsm/routerFSM.ts) — the router's state machine built on this engine
