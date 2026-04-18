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

## Hook Dispatch — onNavigate

| #   | Invariant                                                 | Description                                                                                                                                                                                  |
| --- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `onNavigate` fires on entry when `onEnter` is absent      | Navigating from one route to a target that declares only `onNavigate` calls it exactly once on entry. Confirms `onNavigate` acts as a fallback for the entry case.                           |
| 2   | `onNavigate` fires on param-change when `onStay` is absent | Navigating to the same route with different params calls `onNavigate` exactly once when `onStay` is not defined. Confirms `onNavigate` acts as a fallback for the stay case.                 |
| 3   | `onEnter` takes precedence over `onNavigate` on entry     | When both are defined, only `onEnter` fires on entry — `onNavigate` stays silent. Prevents double-firing of shared side-effects when case-specific overrides exist.                          |
| 4   | `onStay` takes precedence over `onNavigate` on param-change | When both are defined, only `onStay` fires on same-route param change — `onNavigate` stays silent. Prevents double-firing of shared side-effects when case-specific overrides exist.         |

## Hook Ordering

| #   | Invariant                                               | Description                                                                                                                                                                                  |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `onLeave` fires before `onEnter`                        | When both hooks are defined, `onLeave` always precedes `onEnter` in the call order. This is structural: `onLeave` fires on `onTransitionLeaveApprove`, `onEnter` fires on `onTransitionSuccess`. |

## Teardown

| #   | Invariant                                               | Description                                                                                                                                                                                  |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Teardown removes all hooks                              | After `unsubscribe()`, no lifecycle hooks fire on subsequent navigations. Verifies that plugin teardown is complete and does not leak event listeners.                                        |

## Mutual Exclusion

| #   | Invariant                                               | Description                                                                                                                                                                                  |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `onEnter` and `onStay` are mutually exclusive           | For any successful transition, exactly one of `onEnter` or `onStay` fires — never both. Route change → `onEnter`; same route with param change → `onStay`.                                  |
| 2   | `onLeave` does not fire with `onStay`                   | Same-route navigation (param change) does not trigger `onLeave`. `onLeave` only fires when `toState.name !== fromState.name`.                                                                |

## Compilation

| #   | Invariant                                               | Description                                                                                                                                                                                  |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Hook factory is invoked once per route+hook             | `compileHook` calls the factory exactly once; the compiled hook is cached and reused across subsequent navigations to the same route.                                                         |

## Test Files

| File                                          | Invariants | Category                                                     |
| --------------------------------------------- | ---------- | ------------------------------------------------------------ |
| `tests/property/lifecycle.properties.ts`      | 17         | onEnter dispatch, onLeave dispatch, onStay dispatch, onNavigate dispatch + priority, ordering, teardown, mutual exclusion, compilation |
