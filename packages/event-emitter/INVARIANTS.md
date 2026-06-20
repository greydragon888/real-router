# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## Delivery and Ordering

| #   | Invariant | Description                                                                                                                                                                                                                           |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Delivery  | Every listener registered via `on(event, cb)` receives the exact data passed to `emit(event, data)`. For any number of listeners (1-10) and any event name, each callback is called exactly once per emit with the correct arguments. |
| 2   | Ordering  | Listeners are invoked in registration order (FIFO). When N listeners are registered on the same event, they receive control in the same sequence they were added.                                                                     |
| 3   | Isolation | Emitting event `"a"` never calls listeners registered on event `"b"` when `"a" !== "b"`. Registering listeners across multiple distinct events does not break per-event isolation.                                                    |
| 4   | Argument arity | `emit(event, ...args)` delivers exactly the positional arguments passed (0 to 4) to each listener, dispatched by `#callListener`'s `argc` switch. Beyond 4 args are not forwarded (the emit signature caps at 4).                 |

## Unsubscribe

| #   | Invariant   | Description                                                                                                                                                                               |
| --- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Unsubscribe | After calling the unsubscribe function returned by `on()`, or after calling `off(event, cb)`, the listener is not invoked on any subsequent emit. `listenerCount` decrements accordingly. |
| 2   | Idempotency | Calling unsubscribe multiple times, or calling `off()` for a listener that was never registered, is a no-op. No error is thrown and the emitter state is unaffected.                      |

## Bulk Operations

| #   | Invariant | Description                                                                                       |
| --- | --------- | ------------------------------------------------------------------------------------------------- |
| 1   | Clear all | After `clearAll()`, no listener on any event is called. `listenerCount` returns 0 for all events. |

## Snapshot Semantics

| #   | Invariant            | Description                                                                                                                                                                     |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Add during emit      | A listener added inside an emit handler is not called in the current emit. It is registered and will be called on the next emit. The snapshot is taken before iteration begins. |
| 2   | Mid-emit unsubscribe | If a listener unsubscribes other listeners during emit, iteration continues without breaking. All listeners present in the snapshot at the start of emit receive control.       |
| 3   | Snapshot-remove      | A listener removed via `off()` by another listener during the same emit still fires in the current iteration (snapshot semantics), but is not called on subsequent emits.       |

## Listener Count

| #   | Invariant         | Description                                                                                                                                                                            |
| --- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No-listeners emit | Calling `emit(event)` when no listeners are registered is a no-op. No error is thrown and `listenerCount` stays at 0.                                                                  |
| 2   | Count accuracy    | `listenerCount(event)` always reflects the exact number of currently active subscriptions. It increments on each `on()` call and decrements on each successful unsubscribe or `off()`. |

## Registration

| #   | Invariant           | Description                                                                                                                                                                                  |
| --- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Duplicate rejection | Registering the same function reference twice on the same event via `on()` throws a "Duplicate listener" error. The same function on different events does not throw and registers normally. |
| 2   | Atomic rejection    | A rejected duplicate `on()` does not mutate state: `listenerCount` is unchanged and every previously-registered listener still fires exactly once. The failed registration is a no-op beyond the throw. |

## Error Handling

| #   | Invariant       | Description                                                                                                                                                                                      |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Error isolation | A listener that throws does not prevent subsequent listeners from executing. The error is captured and forwarded to `onListenerError`. All non-throwing listeners receive the correct emit data. |
| 2   | RecursionDepthError propagation | A listener that throws `RecursionDepthError` causes `emit` to re-throw it (never routed to `onListenerError`) and halts iteration — on **both** emit paths (fast `maxEventDepth = 0` and depth-tracking `> 0`). |
| 3   | Error forwarding order | When several listeners throw, every error is forwarded to `onListenerError` in registration order, and all non-throwing listeners still run. |

## Listener Limits

| #   | Invariant                | Description                                                                                                                                                                                                  |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | maxListeners enforcement | When `maxListeners > 0`, attempting to register more listeners than the limit throws `"Listener limit"`. Exactly `maxListeners` registrations succeed; the (N+1)th throws.                                   |
| 2   | warnListeners threshold  | When `warnListeners > 0`, the first **successful** registration of the (W+1)th listener (W = warnListeners) invokes `onListenerWarn` once with the event name and threshold value. The hard limit is checked first, so a registration that throws `"Listener limit"` (e.g. `warnListeners === maxListeners`) never warns. Earlier registrations do not trigger it. |
| 3   | warn latch (exactly once) | The warning fires **exactly once per emitter+event** for the lifetime of the listener set — even when off/on churn re-crosses the threshold (`set.size === warnListeners` is re-met). The latch is released when the event's last listener is removed (off → empty Set) or on `clearAll()`, so a fresh accumulation past the threshold warns again. |
| 4   | Atomic limit rejection | An `on()` that hits `maxListeners` throws `"Listener limit"` atomically: `listenerCount` stays at the limit, every accepted listener still fires, the rejected one never runs, and `onListenerWarn` does not fire for it (even when `warnListeners === maxListeners`). |
| 5   | maxEventDepth boundary | When `maxEventDepth = D > 0`, a self-recursive emit nests exactly `D` levels successfully; the `(D+1)`th nested emit throws `RecursionDepthError`. |
| 6   | warn latch reset | After the warning has fired, removing the event's last listener (off → empty Set) or calling `clearAll()` resets the latch, so a fresh accumulation past the threshold warns again. |

## Callback Validation

| #   | Invariant                     | Description                                                                                                                                        |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Non-function throws TypeError | `EventEmitter.validateCallback()` throws `TypeError` for any non-function value (null, undefined, number, string, boolean, object, array, symbol). |

## Stateful Consistency

| #   | Invariant                 | Description                                                                                                                                                                                                                                            |
| --- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Sequence model equivalence | For any interleaving of `on` / `off` / `emit` / `clearAll` (across multiple events and listeners), the emitter stays equivalent to a reference model: each `emit` invokes exactly the currently-registered listeners in registration order, and `listenerCount(event)` always equals the model count. Duplicate `on()` throws without mutating state. |

## Test Files

| File                                        | Invariants | Category                                                                                                                                                          |
| ------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/property/eventEmitter.properties.ts` | 30         | Delivery, ordering, isolation, argument arity, unsubscribe, snapshot semantics, listener count, registration + atomicity, error handling + recursion-depth propagation, limits + depth boundary, warn latch, validation, stateful sequence consistency |
| `tests/property/helpers.ts`                 | —          | Shared arbitraries and emitter factory helpers                                                                                                                   |
