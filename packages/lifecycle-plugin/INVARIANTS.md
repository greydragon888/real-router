# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## Hook Dispatch — onEnter

| #   | Invariant                                               | Description                                                                                                                                                                                  |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `onEnter` fires when a route becomes active             | Navigating to a new route calls `onEnter` on the target route exactly once. Confirms that activation is detected for arbitrary route transitions.                                            |
| 2   | `onEnter` does not fire when the route is already active | When the same route is navigated to with different params, `onEnter` is not called. Prevents false re-activation on param-only changes.                                                      |
| 3   | `onEnter` receives correct states                       | The `toState` argument matches the entered route name, and `fromState` matches the route being left. Verifies hook arguments are not swapped or corrupted across arbitrary transitions.       |

## Hook Dispatch — onLeave

| #   | Invariant                                               | Description                                                                                                                                                                                  |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `onLeave` fires when a route becomes inactive           | Navigating away from a route calls `onLeave` on the leaving route exactly once. Confirms that deactivation is detected for arbitrary route transitions.                                      |
| 2   | `onLeave` does not fire on initial start                | `router.start()` has no previous route, so `onLeave` is never called. Prevents phantom leave events during initialization.                                                                   |
| 3   | `onLeave` receives correct states                       | The `fromState` argument matches the route being left. Verifies hook arguments reflect the actual transition for arbitrary source routes.                                                     |

## Hook Dispatch — onStay

| #   | Invariant                                               | Description                                                                                                                                                                                  |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `onStay` fires when params change on the same route     | Navigating to the same route with different params calls `onStay` exactly once. Confirms that same-route param changes are correctly classified as "stay" events.                             |
| 2   | `onStay` does not fire when route changes               | Navigating to a different route does not call `onStay`. Prevents false stay events on cross-route transitions.                                                                               |

## Hook Ordering

| #   | Invariant                                               | Description                                                                                                                                                                                  |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `onLeave` fires before `onEnter`                        | When both hooks are defined, `onLeave` always precedes `onEnter` in the call order. This is structural: `onLeave` fires on `onTransitionLeaveApprove`, `onEnter` fires on `onTransitionSuccess`. |

## Teardown

| #   | Invariant                                               | Description                                                                                                                                                                                  |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Teardown removes all hooks                              | After `unsubscribe()`, no lifecycle hooks fire on subsequent navigations. Verifies that plugin teardown is complete and does not leak event listeners.                                        |

## Test Files

| File                                          | Invariants | Category                                                     |
| --------------------------------------------- | ---------- | ------------------------------------------------------------ |
| `tests/property/lifecycle.properties.ts`      | 10         | onEnter dispatch, onLeave dispatch, onStay dispatch, ordering, teardown |
