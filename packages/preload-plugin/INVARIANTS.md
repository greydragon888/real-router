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
| 4   | Negative timestamp delta never suppresses mouseover | When `mouseover.timeStamp < touchstart.timeStamp` (possible with synthetic events or clock skew), the delta is negative and the event is never suppressed. Guards against false positive ghost detection. |
| 5   | No prior touch never suppresses mouseover         | When no `touchstart` has been recorded (`lastTouchTimeStamp` is `NaN`), any `mouseover` event passes through unsuppressed. `NaN` arithmetic naturally short-circuits the comparison. |

## Timer Safety

| #   | Invariant                                         | Description                                                                                                                                                                               |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | At most one hover timer active at any time        | When a new `mouseover` fires on a different anchor, the previous hover timer is always cleared via `#cancelHover()` before a new one is scheduled. Prevents duplicate preload triggers.     |
| 2   | At most one touch timer active at any time        | When a new `touchstart` fires, the previous touch timer is always cleared via `#cancelTouch()` before a new one is scheduled. Prevents duplicate preload triggers on rapid taps.           |
| 3   | All timers cleared on stop and teardown           | `router.stop()` and `teardown()` both call `#cleanup()` which cancels all pending hover and touch timers. No timer fires after the plugin is deactivated.                                  |

## Compiled Preloads Cache

| #   | Invariant                                         | Description                                                                                                                                                                               |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Cache size is monotonically non-decreasing        | `#compiledPreloads` entries are only added via `Map.set()`, never deleted. Cache size can only grow or stay the same.                                                                       |
| 2   | Each route name compiled at most once             | `#compiledPreloads.get(name)` is checked before calling `config.preload(router, getDep)`. The factory function runs exactly once per route name for the lifetime of the plugin instance.    |

## Fire-and-Forget Safety

| #   | Invariant                                         | Description                                                                                                                                                                               |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Preload errors never propagate                    | Every `preload.fn(params)` call is followed by `.catch(() => {})`. Rejected promises are silently swallowed and never surface as unhandled rejections.                                     |
| 2   | Preload return values are discarded               | The `Promise` returned by `preload.fn()` is not `await`ed or stored. The plugin does not inspect, cache, or act upon the resolved value.                                                  |

## DOM Traversal — #findAnchor

| #   | Invariant                                         | Description                                                                                                                                                                               |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Element type guard                                | Non-Element targets (Document, Text, null) return `null` via `instanceof Element` check. Prevents `TypeError` when `closest()` is called on non-Element EventTargets.                      |
| 2   | Closest anchor traversal                          | Returns nearest `<a href>` ancestor or `null` if none exists. Uses `Element.closest("a[href]")` — standard DOM traversal.                                                                 |

## Test Files

| File                                          | Invariants | Category                                                                          |
| --------------------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| `tests/property/preload.properties.ts`        | 16         | Factory options merge, network detection, ghost events, fire-and-forget           |
| `tests/functional/lifecycle.test.ts`           | —          | Timer safety (#3), cache compilation, delay coercion (functional coverage)        |
