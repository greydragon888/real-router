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

## Navigation namespace

| #   | Invariant                                                              | Runs |
| --- | ---------------------------------------------------------------------- | ---- |
| 1   | `validateNavigateArgs`: any string never throws                        | 50   |
| 2   | `validateNavigateArgs`: non-string always throws `TypeError`           | 50   |
| 3   | `validateNavigateParams`: valid params object never throws             | 50   |
| 4   | `validateNavigateParams`: non-object params always throws `TypeError`  | 50   |
| 5   | `validateNavigateParams`: `undefined` always passes                    | —    |
| 6   | `validateNavigateToDefaultArgs`: `undefined` always passes             | —    |
| 7   | `validateNavigateToDefaultArgs`: plain objects never throw             | 50   |
| 8   | `validateNavigateToDefaultArgs`: non-object non-undefined throws       | 50   |
| 9   | `validateStartArgs`: `undefined` always passes                         | —    |
| 10  | `validateStartArgs`: paths starting with "/" never throw               | 50   |
| 11  | `validateStartArgs`: empty string never throws                         | —    |
| 12  | `validateStartArgs`: non-"/" prefix strings always throw `TypeError`   | 50   |
| 13  | `validateStartArgs`: non-string non-undefined always throws `TypeError`| 50   |

## Routes namespace

| #   | Invariant                                                                          | Runs |
| --- | ---------------------------------------------------------------------------------- | ---- |
| 1   | `validateBuildPathArgs`: non-empty strings never throw                             | 50   |
| 2   | `validateBuildPathArgs`: empty string throws `TypeError`                           | —    |
| 3   | `validateBuildPathArgs`: non-string always throws `TypeError`                      | 50   |
| 4   | `validateMatchPathArgs`: any string never throws                                   | 50   |
| 5   | `validateMatchPathArgs`: non-string always throws `TypeError`                      | 50   |
| 6   | `validateRemoveRouteArgs`: valid route name strings never throw                    | 50   |
| 7   | `validateRemoveRouteArgs`: non-string always throws `TypeError`                    | 50   |
| 8   | `validateIsActiveRouteArgs`: valid args (string, params, booleans) never throw     | 50   |
| 9   | `validateIsActiveRouteArgs`: non-string name always throws `TypeError`             | 50   |
| 10  | `validateIsActiveRouteArgs`: invalid params always throws `TypeError`              | 50   |
| 11  | `validateShouldUpdateNodeArgs`: any string never throws                            | 50   |
| 12  | `validateShouldUpdateNodeArgs`: non-string always throws `TypeError`               | 50   |
| 13  | `validateSetRootPathArgs`: any string never throws                                 | 50   |
| 14  | `validateSetRootPathArgs`: non-string always throws `TypeError`                    | 50   |
| 15  | `validateUpdateRouteBasicArgs`: valid name + plain object never throws             | 50   |
| 16  | `validateUpdateRouteBasicArgs`: non-string name always throws `TypeError`          | 50   |
| 17  | `validateUpdateRouteBasicArgs`: null/array updates throws `TypeError`              | —    |
| 18  | `validateUpdateRouteBasicArgs`: empty name throws `ReferenceError`                 | —    |

## State namespace

| #   | Invariant                                                                  | Runs |
| --- | -------------------------------------------------------------------------- | ---- |
| 1   | `validateMakeStateArgs`: valid name + optional params/path never throws    | 50   |
| 2   | `validateMakeStateArgs`: non-string name always throws `TypeError`         | 50   |
| 3   | `validateMakeStateArgs`: invalid params always throws `TypeError`          | 50   |
| 4   | `validateMakeStateArgs`: non-string path always throws `TypeError`         | 50   |

## EventBus namespace

| #   | Invariant                                                                           | Runs |
| --- | ----------------------------------------------------------------------------------- | ---- |
| 1   | `validateEventName`: valid event names never throw                                  | 50   |
| 2   | `validateEventName`: invalid event names always throw `TypeError`                   | 50   |
| 3   | `validateListenerArgs`: valid event name + function never throws                    | 50   |
| 4   | `validateListenerArgs`: valid event name + non-function always throws `TypeError`   | 50   |

### Valid event name domain

`$start`, `$stop`, `$$start`, `$$leaveApprove`, `$$cancel`, `$$success`, `$$error`

## Plugins namespace

| #   | Invariant                                                                               | Runs |
| --- | --------------------------------------------------------------------------------------- | ---- |
| 1   | `validatePluginKeys`: plugins with only valid keys never throw                          | 50   |
| 2   | `validatePluginKeys`: plugins with unknown keys always throw `TypeError`                | 50   |
| 3   | `validatePluginLimit`: count within limit never throws                                  | 50   |
| 4   | `validatePluginLimit`: count exceeding limit always throws `RangeError`                 | 50   |
| 5   | `validatePluginLimit`: `maxPlugins=0` disables limit (never throws)                     | —    |
| 6   | `validateAddInterceptorArgs`: valid method + function never throws                      | 50   |
| 7   | `validateAddInterceptorArgs`: invalid method always throws `TypeError`                  | 50   |
| 8   | `validateAddInterceptorArgs`: valid method + non-function always throws `TypeError`     | 50   |

### Valid plugin keys

`onStart`, `onStop`, `onTransitionStart`, `onTransitionLeaveApprove`, `onTransitionSuccess`, `onTransitionError`, `onTransitionCancel`, `teardown`

### Valid interceptor methods

`start`, `buildPath`, `forwardState`

## Lifecycle namespace

| #   | Invariant                                                                       | Runs |
| --- | ------------------------------------------------------------------------------- | ---- |
| 1   | `validateHandler`: boolean or function never throws                             | 50   |
| 2   | `validateHandler`: non-boolean non-function always throws `TypeError`           | 50   |
| 3   | `validateHandlerLimit`: count below default limit (200) never throws            | 50   |
| 4   | `validateHandlerLimit`: count at/above default limit always throws `RangeError` | 50   |
| 5   | `validateHandlerLimit`: count at custom limit always throws `RangeError`        | 50   |
| 6   | `validateHandlerLimit`: `maxLifecycleHandlers=0` disables limit (never throws)  | —    |

## Dependencies namespace

| #   | Invariant                                                                                  | Runs |
| --- | ------------------------------------------------------------------------------------------ | ---- |
| 1   | `validateDependencyName`: any string never throws                                          | 50   |
| 2   | `validateDependencyName`: non-string always throws `TypeError`                             | 50   |
| 3   | `validateSetDependencyArgs`: any string never throws                                       | 50   |
| 4   | `validateSetDependencyArgs`: non-string always throws `TypeError`                          | 50   |
| 5   | `validateDependenciesObject`: plain objects never throw                                    | 50   |
| 6   | `validateDependenciesObject`: non-objects always throw `TypeError`                         | 50   |
| 7   | `validateDependenciesObject`: non-plain objects (Map, Set, Date) always throw `TypeError`  | 50   |
| 8   | `validateDependenciesObject`: objects with getter properties always throw `TypeError`      | 50   |
| 9   | `validateDependencyLimit`: count within limit never throws                                 | 50   |
| 10  | `validateDependencyLimit`: count meeting limit always throws `RangeError`                  | 50   |
| 11  | `validateDependencyLimit`: `maxDependencies=0` disables limit (never throws)               | —    |

## Options — validateLimitValue

| #   | Invariant                                                                          | Runs |
| --- | ---------------------------------------------------------------------------------- | ---- |
| 1   | Valid `maxDependencies` integer in `[0, 10000]` never throws                       | 50   |
| 2   | Valid `maxEventDepth` integer in `[0, 100]` never throws                           | 50   |
| 3   | Non-integer values (float, NaN, Infinity, string, boolean, null) throw `TypeError` | 50   |
| 4   | `maxDependencies` out of bounds always throws `RangeError`                         | 50   |
| 5   | `maxEventDepth` out of bounds always throws `RangeError`                           | 50   |

## Cross-cutting: Idempotency

| #   | Invariant                                                                  | Runs |
| --- | -------------------------------------------------------------------------- | ---- |
| 1   | `validateNavigateArgs`: calling twice on invalid input yields same result  | 50   |
| 2   | `validateEventName`: calling twice on valid input yields same result       | 50   |
