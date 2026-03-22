# Invariants

> Property-based invariants for `dom-utils`. Implemented via [fast-check](https://fast-check.dev/).

## Invariants

### Route Announcer

| #   | Invariant                                                                  | Description                                                                                                                        |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `getOrCreateAnnouncer` is idempotent                                       | Calling it N times always returns the same DOM element. The `[data-real-router-announcer]` count in `document.body` is always ≤ 1. |
| 2   | `resolveText` always returns a non-empty string when `prefix` is non-empty | The fallback chain terminates at `route.name` which is always non-empty for valid navigations.                                     |
| 3   | `createRouteAnnouncer` and `destroy()` are symmetric                       | For any sequence of create/destroy calls, the `[data-real-router-announcer]` element is absent after the last `destroy()`.         |

### Link Utilities

| #   | Invariant                                                                 | Description                                                                                                    |
| --- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 4   | `shouldNavigate` is pure                                                  | For any MouseEvent with the same properties, result is always the same. No side effects.                       |
| 5   | `buildActiveClassName` returns `undefined` only when no class names exist | If `isActive && activeClassName` → result is always a non-empty string. If `!isActive && !base` → `undefined`. |
| 6   | `applyLinkA11y` is idempotent                                             | Calling it N times on the same element produces the same result as calling it once.                            |
| 7   | `applyLinkA11y` preserves existing attributes                             | If `role` or `tabindex` already set, they are never overwritten.                                               |
