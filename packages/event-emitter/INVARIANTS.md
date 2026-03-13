# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## Delivery and Ordering

| #   | Invariant | Description                                                                                                                                                                                                                           |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Delivery  | Every listener registered via `on(event, cb)` receives the exact data passed to `emit(event, data)`. For any number of listeners (1-10) and any event name, each callback is called exactly once per emit with the correct arguments. |
| 2   | Ordering  | Listeners are invoked in registration order (FIFO). When N listeners are registered on the same event, they receive control in the same sequence they were added.                                                                     |
| 3   | Isolation | Emitting event `"a"` never calls listeners registered on event `"b"` when `"a" !== "b"`. Registering listeners across multiple distinct events does not break per-event isolation.                                                    |

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

## Error Handling

| #   | Invariant       | Description                                                                                                                                                                                      |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Error isolation | A listener that throws does not prevent subsequent listeners from executing. The error is captured and forwarded to `onListenerError`. All non-throwing listeners receive the correct emit data. |

## Listener Limits

| #   | Invariant                | Description                                                                                                                                                                                                  |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | maxListeners enforcement | When `maxListeners > 0`, attempting to register more listeners than the limit throws `"Listener limit"`. Exactly `maxListeners` registrations succeed; the (N+1)th throws.                                   |
| 2   | warnListeners threshold  | When `warnListeners > 0`, registering the (W+1)th listener (where W = warnListeners) invokes `onListenerWarn` exactly once with the event name and threshold value. Earlier registrations do not trigger it. |

## Callback Validation

| #   | Invariant                     | Description                                                                                                                                        |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Non-function throws TypeError | `EventEmitter.validateCallback()` throws `TypeError` for any non-function value (null, undefined, number, string, boolean, object, array, symbol). |

## Test Files

| File                                        | Invariants | Category                                                                                                                         |
| ------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `tests/property/eventEmitter.properties.ts` | 19         | Delivery, ordering, isolation, unsubscribe, snapshot semantics, listener count, registration, error handling, limits, validation |
| `tests/property/helpers.ts`                 | —          | Shared arbitraries and emitter factory helpers                                                                                   |
