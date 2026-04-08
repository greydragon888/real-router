# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## Factory Options Merge

| #   | Invariant                                         | Description                                                                                                                                                                               |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Undefined options produce complete defaults       | Calling `preloadPluginFactory()` with no arguments produces options where `delay === 65` and `networkAware === true`. Confirms that the spread `{ ...defaultOptions, ...undefined }` path yields correct defaults. |
| 2   | Partial options merge with defaults               | Supplying a subset of options (e.g., only `delay`) produces a complete options object where missing fields are filled from `defaultOptions`. Verifies that user overrides take precedence while defaults fill gaps. |

## Network Detection — isSlowConnection

| #   | Invariant                                         | Description                                                                                                                                                                               |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Returns `false` when `navigator.connection` is unavailable | When `navigator.connection` is `undefined` (desktop browsers, SSR stubs), `isSlowConnection()` always returns `false`. Ensures preloading is never blocked by missing Network Information API. |
| 2   | `saveData` flag forces slow detection             | When `navigator.connection.saveData` is `true`, `isSlowConnection()` returns `true` regardless of `effectiveType`. Respects the user's explicit data-saving preference.                    |
| 3   | `effectiveType` containing "2g" forces slow detection | When `effectiveType` is `"2g"` or `"slow-2g"`, `isSlowConnection()` returns `true`. Detects the two slowest network tiers defined by the Network Information API.                          |
| 4   | Fast `effectiveType` without `saveData` returns `false` | When `effectiveType` is `"3g"` or `"4g"` and `saveData` is `false`/`undefined`, `isSlowConnection()` returns `false`. Confirms that only genuinely slow connections are flagged.             |

## Ghost Event Suppression

| #   | Invariant                                         | Description                                                                                                                                                                               |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Mouseover within threshold on same target is suppressed | A `mouseover` event that shares the same `target` as a preceding `touchstart` and occurs within 2500ms of it is classified as a ghost event. Prevents duplicate preload triggers on touch devices that emit synthetic mouse events. |
| 2   | Mouseover after threshold on same target is not suppressed | A `mouseover` event that shares the same `target` as a preceding `touchstart` but occurs 2500ms or later after it is not classified as a ghost event. Ensures the suppression window does not persist indefinitely. |
| 3   | Mouseover on different target is never suppressed | A `mouseover` event whose `target` differs from the preceding `touchstart` target is never classified as a ghost event, regardless of timing. Ghost suppression is target-scoped, not global. |

## Test Files

| File                                          | Invariants | Category                                                |
| --------------------------------------------- | ---------- | ------------------------------------------------------- |
| `tests/property/preload.properties.ts`        | 9          | Factory options merge, network detection, ghost events  |
