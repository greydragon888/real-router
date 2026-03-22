# Invariants

> Property-based invariants for `dom-utils`. No property-based tests yet — the current test suite uses deterministic unit tests only.

## Planned Invariants

Once property-based tests are added (via [fast-check](https://fast-check.dev/)), the following invariants should hold:

| #   | Invariant                                                                  | Description                                                                                                                        |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `getOrCreateAnnouncer` is idempotent                                       | Calling it N times always returns the same DOM element. The `[data-real-router-announcer]` count in `document.body` is always ≤ 1. |
| 2   | `resolveText` always returns a non-empty string when `prefix` is non-empty | The fallback chain terminates at `route.name` which is always non-empty for valid navigations.                                     |
| 3   | `createRouteAnnouncer` and `destroy()` are symmetric                       | For any sequence of create/destroy calls, the `[data-real-router-announcer]` element is absent after the last `destroy()`.         |
