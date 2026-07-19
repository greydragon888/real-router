# @real-router/fsm

> **Folded into core (sole source of truth).** This is the LIVE generic FSM
> engine `@real-router/core` builds on — the router state machine
> (`../../routerFSM.ts`) is constructed from it. It was copied here (wave-1a)
> from the standalone `@real-router/fsm` package, whose source was then **deleted**
> (wave-3); `@real-router/fsm@0.6.1` remains published-by-mistake on npm
> (deprecated), but there is no longer a source package — **this is the only copy.**
> The docs below are co-located as-is; a few cross-links may still use the old
> standalone package layout (pending doc integration — see root
> `IMPLEMENTATION_NOTES.md`).

Generic synchronous finite-state-machine engine. Zero runtime dependencies.

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

- **`send()` payload is type-correlated to the event (symmetric with `on`)** — `send<E extends TEvents>(event, ...payload)` indexes by the *specific* event `E`, not the full union: `send("E1", payloadForE2)` is a type error, a payload event's payload is **required** (`send("FETCH")` errors), and a no-payload event rejects any payload (`send("START", {})` errors). Resolved in [#753](https://github.com/greydragon888/real-router/issues/753) — previously `send(event: TEvents, payload?: TPayloadMap[TEvents])` indexed by the full `TEvents` union (effectively `unknown`), so any payload compiled. Runtime is unchanged; the fix is type-level only. The **output** side matches: `onTransition`'s `TransitionInfo` is a discriminated union over `event`, so `info.payload` narrows by `info.event` ([#886](https://github.com/greydragon888/real-router/issues/886)) — the payload contract is now correlated across input (`send`), action (`on`), and output (`info`). (Dormant for core: `RouterPayloads` is empty.)
- **Undeclared states are rejected at every state-entry-point** — `new FSM({ initial })`, `on(from, …)`, and every transition **target** in the table (validated for closure once at construction, #1159) run a shared `requireDeclared` guard and throw `[FSM.<where>] state "…" is not declared in config.transitions` instead of bricking the FSM (a dangling `initial` or transition target would leave `#currentTransitions` `undefined` → cryptic `TypeError` on the next `canSend`/`send`) or silently dead-registering an action (`on`, whose action could never fire). The closure pass is O(states×events) on the cold construction path and **skips explicit `undefined` targets** (the declared "no transition" no-op); post-construction mutation of the shared table stays a documented GIGO boundary (see the `context`/`transitions` shared-by-reference gotcha below). The type forbids undeclared states for a **narrow** state union; the guard hardens `string`-typed / JS / cast callers, mirroring `send()`'s defensiveness on unknown input. Resolved in [#754](https://github.com/greydragon888/real-router/issues/754) (originally the `forceState` guard) + [#885](https://github.com/greydragon888/real-router/issues/885) (constructor + `on`) + [#1159](https://github.com/greydragon888/real-router/issues/1159) (table targets). (`forceState` itself was removed once core stopped using it — see CHANGELOG.)
- **Reentrancy is unbounded** — calling `send()` from inside an `onTransition` listener (or an action) is allowed and not depth-limited; the caller must prevent infinite loops. State is updated **before** listeners fire, so `getState()` reflects the new state even if a listener throws. Under a reentrant `send`, a listener's `info.to` reflects *its own* transition's target while `getState()` reflects the final state after the nested transition — **do not assume `info.to === getState()`** in reentrant listeners. See [#755](https://github.com/greydragon888/real-router/issues/755).
- **No listener snapshot (differs from `event-emitter`)** — `send()` iterates the **live** `#listeners` array, so a listener added during a `send` *is* called within that same `send`, and a freed null slot is reused at its original position (changing fire order). The sibling `event-emitter` primitive snapshots the listener set before iterating — the two repo primitives intentionally differ here. See [#755](https://github.com/greydragon888/real-router/issues/755).
- **Actions are single-captured per `send` (no live re-dispatch)** — the mutation-during-dispatch semantics above apply to `onTransition` listeners **only**. An `on()` action is read into a local **before** it fires (`const action = …; action(payload)`), so re-registering the `(from, event)` action **during its own dispatch** (a reentrant `on()`) does **not** re-fire it in the current `send()` — the new action takes effect on the *next* `send`. Listeners are live-iterated; actions are captured once. Intentional — the two dispatch mechanisms differ here.
- **Listener exceptions propagate** — unlike `event-emitter` (per-listener `try/catch` + `onListenerError`), `FSM` has no error isolation; a throwing `onTransition` listener escapes `send()` to the caller (state already updated).
- **`context` and `transitions` are shared by reference** — `getContext()` returns the same object passed in config; the engine never mutates it. Pass an immutable/owned value if identity matters.
- **One action per `(from, event)`** — `on()` overwrites a prior action for the same state+event pair (last-write-wins), unlike `onTransition` which appends.

## Module Structure

```
src/
├── fsm.ts    -- FSM class (send, canSend, on, onTransition, getState, getContext)
├── types.ts  -- FSMConfig, TransitionInfo, TransitionListener (internal)
└── index.ts  -- public re-exports (FSM, FSMConfig, TransitionInfo)
```

## Tests

- `tests/functional/` — unit tests
- `tests/property/` — fast-check generative tests (`arbFSMConfig` builds arbitrary transition tables); see `INVARIANTS.md` for the invariant catalogue (state-transition determinism, listener reentrancy/validity, terminal states, `TransitionInfo` shape, action dispatch)
- **No `tests/stress/` — intentional, not a gap.** The FSM has no unbounded-growth path, so a heap-threshold stress test would lack discriminating power (the "theatre" the root [CLAUDE.md](../../CLAUDE.md) stress-test doctrine warns about). Every structure is bounded:
  - `#listeners` is bounded by **peak** concurrent listeners (null-slot reuse via `indexOf(null)`); its only memory-discriminable behavior — staying bounded under churn — rides the *same* code path as the reuse-correctness property (`INVARIANTS.md` → Listener "Churn integrity"), already mutation-validated (force-append breaks order **and** growth together). A stress test would be redundant.
  - `#actions` is **hard-capped** at `|states| × |events|` (last-write-wins; unsub `delete`s) → KB-scale, below the heap noise floor → no signal to threshold against.
  - `send` rest-args / `TransitionInfo` are transient → GC-reclaimed (GC-masked, invisible to heap snapshots). That's GC-pressure/throughput — not locked by any local benchmark suite; functional + property tests cover correctness of the affected paths.
  - Synchronous & single-threaded → no async/concurrency race surface.
  - Contrast: sibling `event-emitter` *does* ship `tests/stress/` because it holds listener **records** needing explicit release (a real leak class, #752); the FSM's `#listeners[index] = null` releases the ref directly, so that surface doesn't exist here. The former lone unbounded path — `on(undeclaredFrom, …)` accumulating one never-deleted inner Map per distinct undeclared `from` — was **closed by #885** (`requireDeclared` in `on()` now throws before registering, consistent with the declared-state guard gotcha above), so even that misuse surface no longer leaks — **not** a stress test.

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — engine internals and design decisions
- [INVARIANTS.md](INVARIANTS.md) — invariant catalogue (basis for property tests)
- [packages/core/src/routerFSM.ts](../../routerFSM.ts) — the router's state machine built on this engine
