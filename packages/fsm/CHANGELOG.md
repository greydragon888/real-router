# @real-router/fsm

## 0.2.0

### Minor Changes

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `canSend()` for O(1) event validity check (#123)

  New `canSend(event): boolean` method checks if an event is valid in the current state. Uses cached `#currentTransitions` for O(1) lookup without triggering any transitions or side effects.

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - Add typed `on(from, event, action)` for transition actions (#123)

  New `on(from, event, action)` method registers a type-safe action for a specific `(from, event)` pair. Actions fire before `onTransition` listeners. Lazy `#actions` Map — zero-cost when not used. Returns an unsubscribe function.

## 0.1.0

### Minor Changes

- [#111](https://github.com/greydragon888/real-router/pull/111) [`fd84735`](https://github.com/greydragon888/real-router/commit/fd847353f413a4c6727751cfdc6e078abef7c14d) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/fsm` package — universal synchronous FSM engine (#110)

  New package providing a zero-dependency, fully typed finite state machine with O(1) transition lookup, type-safe payloads via `TPayloadMap`, and listener management with null-slot reuse pattern.
