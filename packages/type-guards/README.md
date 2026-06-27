# type-guards

[![Mutation Score](https://img.shields.io/endpoint?style=flat-square&url=https%3A%2F%2Fbadge-api.stryker-mutator.io%2Fgithub.com%2Fgreydragon888%2Freal-router%2Fmaster%3Fmodule%3Dtype-guards)](https://dashboard.stryker-mutator.io/reports/github.com/greydragon888/real-router/master?module=type-guards)

> Runtime type validation utilities for Real-Router core types.

**Internal package** — consumed by `@real-router/core`, `browser-env`, `browser-plugin`, `hash-plugin`, `persistent-params-plugin`. Not published to npm.

## Purpose

Centralized type guards and validators for all Real-Router types. Provides both boolean-returning guards (for branching) and assertion validators (for fail-fast).

## Public API

### Type Guards

| Guard                        | Returns                                | Used by                                                                                                            |
| ---------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `isState(value)`             | `value is State`                       | Quick field presence check                                                                                         |
| `isStateStrict(value)`       | `value is State`                       | Deep validation (types, params). Browser plugins, serialization                                                    |
| `isParams(value)`            | `value is Params`                      | Flexible — allows nested objects. Core                                                                             |
| `isParamsStrict(value)`      | `value is Params`                      | Strict — primitives and arrays only. Rejects `NaN`, `Infinity`, nested objects, class instances. URL serialization |
| `isNavigationOptions(value)` | `value is NavigationOptions`           | Core                                                                                                               |
| `isRouteName(value)`         | `value is string`                      | Route validation                                                                                                   |
| `isString(value)`            | `value is string`                      | Primitive                                                                                                          |
| `isBoolean(value)`           | `value is boolean`                     | Primitive                                                                                                          |
| `isPrimitiveValue(value)`    | `value is string \| number \| boolean` | Persistent params                                                                                                  |
| `isObjKey(key, obj)`         | `key is keyof typeof obj`              | Key narrowing                                                                                                      |

### Validators (assertion)

| Validator                             | Throws      | Description              |
| ------------------------------------- | ----------- | ------------------------ |
| `validateRouteName(name, methodName)` | `TypeError` | Asserts valid route name |
| `validateState(value)`                | `TypeError` | Asserts valid State      |

### Utilities

`getTypeDescription(value)` — human-readable type description for error messages.

## Route Name Rules

- Segments: `[a-zA-Z_][a-zA-Z0-9_-]*`, separated by dots
- Empty string valid (root node)
- `@@` prefix valid (system routes)
- No consecutive, leading, or trailing dots

## Key Design Decisions

- **`isParams` vs `isParamsStrict`** — two validation levels because core allows nested objects internally, but URL serialization in browser plugins requires flat primitives
- **`isState` vs `isStateStrict`** — quick presence check vs deep type validation. `isStateStrict` is used by browser plugins to validate `history.state` which can be corrupted by external code
- **Assertion validators** throw `TypeError` with method name context for debuggable error messages

## Dependencies

- `@real-router/types` — `State`, `Params`, `NavigationOptions` type definitions

## License

[MIT](../../LICENSE)
