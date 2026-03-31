# @real-router/validation-plugin — Invariants

Invariants verified by property-based tests (`tests/property/`). Each invariant is tested with thousands of generated inputs via fast-check.

## validateOptions

| #   | Invariant                                                                                    | Runs   |
| --- | -------------------------------------------------------------------------------------------- | ------ |
| 1   | Any combination of valid enum values and valid types never throws                            | 10,000 |
| 2   | Unknown option keys always throw `TypeError` ("Unknown option")                              | 5,000  |
| 3   | Invalid enum values always throw `TypeError`                                                 | 5,000  |
| 4   | Non-object inputs (null, undefined, array, string, number, boolean) always throw `TypeError` | 5,000  |
| 5   | Any subset of valid fields (partial options) never throws                                    | 5,000  |
| 6   | Limit values outside `[min, max]` bounds always throw `RangeError`                           | 3,000  |

### Valid enum domains

- `trailingSlash`: `"strict"` | `"never"` | `"always"` | `"preserve"`
- `queryParamsMode`: `"default"` | `"strict"` | `"loose"`
- `urlParamsEncoding`: `"default"` | `"uri"` | `"uriComponent"` | `"none"`
- `queryParams.arrayFormat`: `"none"` | `"brackets"` | `"index"` | `"comma"`
- `queryParams.booleanFormat`: `"none"` | `"auto"` | `"empty-true"`
- `queryParams.nullFormat`: `"default"` | `"hidden"`
- `logger.level`: `"all"` | `"warn-error"` | `"error-only"` | `"none"`

### Limit bounds

| Limit                  | Min | Max     |
| ---------------------- | --- | ------- |
| `maxDependencies`      | 0   | 10,000  |
| `maxPlugins`           | 0   | 1,000   |
| `maxListeners`         | 0   | 100,000 |
| `warnListeners`        | 0   | 100,000 |
| `maxEventDepth`        | 0   | 100     |
| `maxLifecycleHandlers` | 0   | 10,000  |

## validateCloneArgs

| #   | Invariant                                                                             | Runs   |
| --- | ------------------------------------------------------------------------------------- | ------ |
| 1   | `undefined` always passes (no throw)                                                  | —      |
| 2   | Plain objects with primitive values never throw                                       | 10,000 |
| 3   | Non-objects (null, string, number, boolean, function, array) always throw `TypeError` | 5,000  |
| 4   | Objects with getter properties always throw `TypeError`                               | 3,000  |
| 5   | Non-plain objects (`Map`, `Set`, `Date`, class instances) always throw `TypeError`    | 3,000  |
