# event-emitter

Internal package providing a generic typed event emitter for Real-Router. Not published to npm -- used by core for all internal eventing.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `EventEmitter<TEventMap>` | Class | Typed event emitter with opt-in limits, re-entrancy coalescing, and error isolation |
| `EventEmitterLimits` | Type | `{ maxListeners, warnListeners }` |
| `EventEmitterOptions` | Type | Constructor options (limits, onListenerError, onListenerWarn) |
| `Unsubscribe` | Type | `() => void` returned by `on()` |

## EventEmitter API

| Method | Description |
|--------|-------------|
| `on(event, cb)` | Subscribe; returns `Unsubscribe`. Throws on duplicate listener or limit exceeded |
| `off(event, cb)` | Remove a listener |
| `emit(event, ...args)` | Fire event to all listeners (snapshot iteration); re-entrant same-event emit is coalesced |
| `clearAll()` | Remove all listeners and reset the warn latch (the in-flight `#dispatching` guard is not cleared here — it self-releases per emit) |
| `listenerCount(event)` | Number of listeners for an event |
| `isDispatching(event)` | Whether the event is currently in-flight (its `emit` is on the stack) — the re-entrancy coalesce guard (#1033) |
| `setLimits(limits)` | Replace current limits at runtime |
| `EventEmitter.validateCallback(cb, event)` | Static assertion that cb is a function |

## All Features Are Opt-In

Limits default to `{ maxListeners: 0, warnListeners: 0 }` -- all zeros mean disabled. Pass non-zero values via constructor options to enable. Re-entrancy coalescing is always on (it is the dispatch model, not a limit).

## Module Structure

```
src/
├── EventEmitter.ts  -- EventEmitter class (emit, on, off, re-entrancy coalescing)
├── types.ts         -- EventEmitterLimits, EventEmitterOptions, Unsubscribe
└── index.ts         -- re-exports
```

## Gotchas

- **Re-entrant emit is coalesced (#1033)** -- emitting an event that is already being dispatched (a listener that synchronously re-emits the **same** event) is a **no-op**, guarded by the per-event `#dispatching` set. An event can never re-enter its own dispatch (depth ≤ 1), so recursion is structurally impossible — no depth bound, no stack-overflow path. Re-emitting a **different** event from a listener is unaffected. (This replaced the former `maxEventDepth` depth bound + `RecursionDepthError` sentinel.)
- **Duplicate listeners throw** -- calling `on()` with the same function reference twice for the same event throws an Error, not a silent no-op
- **`onListenerWarn` is latched, throw-first** -- the warning fires **exactly once per emitter+event** (off/on churn around the threshold does not re-fire; the latch is released by `clearAll()` or by removing the event's last listener). The `maxListeners` throw is checked **before** the warn, so a registration that hits the hard limit never warns (`warnListeners === maxListeners` → warn is unreachable)
- **`off()` releases the per-event record** -- when the last listener for an event is removed, the now-empty `Set` (and its warn latch) is deleted from the internal map. This prevents an unbounded heap leak for consumers with **dynamic event names** (`listenerCount()` returns 0 either way, so the leak was invisible to it). See #750. The re-entrancy guard `#dispatching` likewise self-releases per emit (in a `finally`), so it never accumulates.
- **Snapshot iteration** -- `emit()` snapshots the listener set before iteration; listeners added/removed during emit do not affect the current invocation
- **Per-listener error isolation (sync throws + async rejections, #1412)** -- `emit()` isolates each listener two ways, both routed to the `onListenerError` callback (if provided) so other listeners still execute: (1) a **synchronous** throw is caught by the surrounding `try/catch`; (2) a listener typed `=> void` that nonetheless returns a **Promise** at runtime (an `async` router hook, or an `any`-cast misuse) has its **rejection** isolated too — `emit` inspects the return value and, if it is a thenable, attaches a terminal `.catch` that forwards the rejection to `onListenerError`. Without (2) an async listener's rejection would escape as a Node `unhandledRejection` (fatal under `--unhandled-rejections=strict`, the Node 22+ default). All listener failures are isolated — there is no re-thrown sentinel. (This central isolation is why core's `subscribe` wrapper no longer needs its own per-site `.catch`, #944 — it just returns the listener's value to the emitter.)
- **Explicit args, not rest params** -- `emit()` takes up to 4 explicit args to avoid V8 array materialization overhead; extra `undefined` args are harmless (JS ignores extra function arguments)
- **Fast path for single listener** -- when a set has exactly one listener, `emit` skips the `[...set]` array spread (direct call). Single-subscriber events (the common router case) get the shortcut, avoiding the snapshot allocation
- **No dependencies** -- zero runtime dependencies; fully self-contained
- **Property-based tests** -- `tests/property/` contains fast-check generative tests for emitter invariants
- **Heap-stress tests** -- `tests/stress/` (`pnpm -F event-emitter test:stress`, runs with `--expose-gc`) guards against the dynamic-event-name heap leak in `#callbacks` (#750); thresholds are anchored to measured healthy vs leak deltas
