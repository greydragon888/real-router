# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## Primitive Guards

| #   | Invariant                                                        | Description                                                                                                                                                              |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | isString accepts all strings                                     | `isString(x)` returns `true` for every string value, including empty strings and strings with special characters.                                                        |
| 2   | isString rejects non-strings                                     | `isString(x)` returns `false` for integers, booleans, and `null`. It never produces false positives.                                                                     |
| 3   | isString is deterministic                                        | Calling `isString` twice with the same value always returns the same result.                                                                                             |
| 4   | isBoolean accepts true and false                                 | `isBoolean(x)` returns `true` for both `true` and `false`. It correctly handles both boolean literals.                                                                   |
| 5   | isBoolean rejects non-booleans                                   | `isBoolean(x)` returns `false` for strings, integers, `null`, and the number `1`. It does not treat truthy values as booleans.                                           |
| 6   | isObjKey accepts all existing own keys                           | For any object, `isObjKey(key, obj)` returns `true` for every key returned by `Object.keys()`.                                                                           |
| 7   | isObjKey matches the `in` operator                               | For keys not present as own properties, `isObjKey` returns the same result as the `in` operator, which also checks inherited properties.                                 |
| 8   | isObjKey is deterministic                                        | Calling `isObjKey` twice with the same key and object always returns the same result.                                                                                    |
| 9   | isPrimitiveValue accepts valid primitives                        | `isPrimitiveValue(x)` returns `true` for strings, booleans, integers, finite floats, `0`, and `-0`.                                                                      |
| 10  | isPrimitiveValue rejects NaN and Infinity                        | `isPrimitiveValue(NaN)`, `isPrimitiveValue(Infinity)`, and `isPrimitiveValue(-Infinity)` all return `false`. These are not valid primitive values in the router context. |
| 11  | isPrimitiveValue rejects null, undefined, functions, and symbols | Non-primitive types are always rejected.                                                                                                                                 |
| 12  | isPrimitiveValue correctly handles floats                        | For any float, the result is `true` if and only if the value is finite and not `NaN`.                                                                                    |
| 13  | isString implies isPrimitiveValue                                | If `isString(x)` is `true`, then `isPrimitiveValue(x)` is also `true`. Strings are a subset of valid primitives.                                                         |
| 14  | isBoolean implies isPrimitiveValue                               | If `isBoolean(x)` is `true`, then `isPrimitiveValue(x)` is also `true`. Booleans are a subset of valid primitives.                                                       |
| 15  | Valid integers imply isPrimitiveValue                            | Every integer passes `isPrimitiveValue`.                                                                                                                                 |
| 16  | Primitive types are mutually exclusive                           | A value can satisfy at most one of `isString` and `isBoolean`. No value is classified as both.                                                                           |

## Params Guards

| #   | Invariant                                           | Description                                                                                                                                                   |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | isParams accepts simple params                      | `isParams(x)` returns `true` for any flat object with primitive values.                                                                                       |
| 2   | isParams accepts params with arrays                 | Objects containing arrays of primitives are valid params.                                                                                                     |
| 3   | isParams accepts nested params                      | Objects with nested object values are valid params. `isParams` validates recursively.                                                                         |
| 4   | isParams rejects NaN, Infinity, and functions       | Objects containing `NaN`, `Infinity`, or function values are rejected.                                                                                        |
| 5   | isParams rejects non-objects                        | Primitives, `null`, `undefined`, and arrays at the top level are not valid params.                                                                            |
| 6   | isParams is deterministic                           | Calling `isParams` twice with the same object always returns the same result.                                                                                 |
| 7   | isParams rejects top-level arrays                   | An array is not a valid `Params` object, even if its elements would be valid param values.                                                                    |
| 8   | isParamsStrict accepts simple params                | `isParamsStrict(x)` returns `true` for flat objects with primitive values.                                                                                    |
| 9   | isParamsStrict accepts params with arrays           | Objects containing arrays of primitives pass strict validation.                                                                                               |
| 10  | isParamsStrict rejects invalid params               | Objects with `NaN`, `Infinity`, or functions are rejected by the strict guard.                                                                                |
| 11  | isParamsStrict is deterministic                     | Calling `isParamsStrict` twice with the same object always returns the same result.                                                                           |
| 12  | isParamsStrict implies isParams                     | If `isParamsStrict(x)` is `true`, then `isParams(x)` is also `true`. Strict is a subset of flexible.                                                          |
| 13  | Not-isParams implies not-isParamsStrict             | If `isParams(x)` is `false`, then `isParamsStrict(x)` is also `false`. The strict guard never accepts what the flexible guard rejects.                        |
| 14  | Both guards agree on valid params with arrays       | For objects that pass `isParams`, `isParamsStrict` returns the same result.                                                                                   |
| 15  | isParams accepts undefined and null values          | Params with `undefined` or `null` values are valid. These represent optional or absent fields.                                                                |
| 16  | isParams accepts arrays of booleans                 | Arrays containing boolean values are valid param values.                                                                                                      |
| 17  | isParams accepts arrays of nested objects           | Arrays containing plain objects are valid param values. `isParams` validates each element recursively.                                                        |
| 18  | isParams accepts deeply nested structures           | Multi-level nesting is valid. The recursive validation has no depth limit.                                                                                    |
| 19  | isParams rejects arrays with invalid element types  | Arrays containing symbols or functions are rejected.                                                                                                          |
| 20  | isParams rejects objects with invalid nested values | Nested objects containing symbols or functions are rejected.                                                                                                  |
| 21  | isParams rejects self-referencing circular objects  | Objects with circular references (where a property points back to the object itself) are rejected via `WeakSet` cycle detection in `isSerializable`.          |
| 22  | isParams rejects circular references through arrays | Objects whose arrays contain back-references to parent objects are rejected. The `WeakSet` tracks all visited objects during recursive validation.            |
| 23  | isParams rejects class instances as nested values   | Objects containing class instances (`Date`, `Map`, `Set`, `RegExp`) as property values are rejected due to custom prototype check in `isSerializable`.        |
| 24  | isParams rejects class instances at top level       | Class instances (with prototypes other than `Object.prototype` or `null`) are not valid params. The prototype check applies at the top level and recursively. |

## State Guards

| #   | Invariant                                    | Description                                                                                                                |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | isState accepts minimal valid State          | Any object with valid `name`, `path`, and `params` fields passes `isState`.                                                |
| 2   | isState accepts full State with meta         | A State object with a `meta` field also passes `isState`.                                                                  |
| 3   | isState rejects invalid State                | Objects with missing required fields or wrong field types are rejected.                                                    |
| 4   | isState rejects primitives                   | Primitives, `null`, and `undefined` are never valid State objects.                                                         |
| 5   | isState is deterministic                     | Calling `isState` twice with the same object always returns the same result.                                               |
| 6   | isState accepts State with additional fields | Extra fields beyond `name`, `path`, and `params` do not cause rejection. The guard is not strict about unknown properties. |
| 7   | isStateStrict accepts minimal valid State    | Any object with valid `name`, `path`, and `params` fields passes `isStateStrict`.                                          |
| 8   | isStateStrict rejects invalid params         | A State with `null`, a primitive, or `NaN` as `params` is rejected by the strict guard.                                    |
| 9   | isStateStrict rejects meta.id as non-number  | A State whose `meta.id` is a string instead of a number is rejected. The strict guard validates meta field types.          |
| 10  | isStateStrict rejects primitives             | Primitives, `null`, and `undefined` are never valid State objects under strict validation.                                 |
| 11  | isStateStrict implies isState                | If `isStateStrict(x)` is `true`, then `isState(x)` is also `true`. Strict is a subset of flexible.                         |

## Navigation Guards

| #   | Invariant                                           | Description                                                                                                                                                                          |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | isNavigationOptions accepts valid options           | Any object with valid optional boolean fields (`replace`, `reload`, `force`, `forceDeactivate`, `redirected`), an optional `AbortSignal` (`signal`), and an optional `state` passes. |
| 2   | isNavigationOptions accepts empty object            | `{}` is a valid `NavigationOptions` value. All fields are optional.                                                                                                                  |
| 3   | isNavigationOptions rejects invalid options         | Objects with non-boolean values for `replace`, `reload`, `force`, `forceDeactivate`, or `redirected`, or non-`AbortSignal` values for `signal`, are rejected.                        |
| 4   | isNavigationOptions rejects primitives              | Primitives, `null`, and `undefined` are not valid `NavigationOptions`.                                                                                                               |
| 5   | isNavigationOptions is deterministic                | Calling `isNavigationOptions` twice with the same object always returns the same result.                                                                                             |
| 6   | isNavigationOptions accepts undefined field values  | Fields set to `undefined` are treated as absent and do not cause rejection.                                                                                                          |
| 7   | isNavigationOptions does not validate state field   | The `state` field is not validated by the guard. It may be `null`, `undefined`, or any value. Only the boolean fields and `signal` are type-checked.                                 |
| 8   | isNavigationOptions validates forceDeactivate field | If `forceDeactivate` is present, it must be boolean. Non-boolean values (string, number, null) cause rejection.                                                                      |
| 9   | isNavigationOptions validates redirected field      | If `redirected` is present, it must be boolean. Non-boolean values cause rejection.                                                                                                  |
| 10  | isNavigationOptions validates signal field          | If `signal` is present, it must be an `AbortSignal` instance. Valid `AbortSignal` values pass; `undefined` is treated as absent.                                                     |
| 11  | isNavigationOptions rejects non-AbortSignal signal  | Non-`AbortSignal` values for `signal` (string, number, null, plain object) cause rejection. Unlike boolean fields, `signal` uses `instanceof` check.                                 |

## Route Name Guards

| #   | Invariant                                      | Description                                                                                         |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | isRouteName never throws                       | `isRouteName(x)` never throws for any string input. It always returns a boolean.                    |
| 2   | isRouteName rejects non-strings                | Non-string values (integers, booleans, `null`, `undefined`, objects, arrays) always return `false`. |
| 3   | isRouteName accepts valid route name patterns  | Strings matching `[A-Za-z_][\\w-]*` with dot-separated segments are valid route names.              |
| 4   | isRouteName accepts system routes              | Strings starting with `@@` are always valid, regardless of the rest of the content.                 |
| 5   | isRouteName rejects names exceeding max length | Strings longer than `MAX_ROUTE_NAME_LENGTH` (10,000 characters) are rejected.                       |
| 6   | isRouteName accepts empty string               | An empty string is a valid route name representing the root node.                                   |
| 7   | isRouteName rejects whitespace-only strings    | Strings containing only spaces, tabs, or newlines are not valid route names.                        |
| 8   | isRouteName rejects consecutive dots           | Any name containing `..` is invalid. Dots must separate non-empty segments.                         |
| 9   | isRouteName rejects leading dots               | A name starting with `.` (and longer than one character) is invalid.                                |
| 10  | isRouteName rejects trailing dots              | A name ending with `.` (and longer than one character) is invalid.                                  |

## State Validators

| #   | Invariant                                                  | Description                                                                                                                                |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | validateState does not throw for valid State               | For any minimal or full valid State, `validateState` completes without throwing.                                                           |
| 2   | validateState throws TypeError for invalid State           | For any invalid State object, `validateState` throws a `TypeError`.                                                                        |
| 3   | validateState throws TypeError for primitives              | Primitives, `null`, and `undefined` always cause `validateState` to throw a `TypeError`.                                                   |
| 4   | Error message includes method name                         | The thrown error message always contains `[methodName]`, making it easy to identify the call site.                                         |
| 5   | Error message includes "Invalid state structure"           | The thrown error message always contains the phrase `"Invalid state structure"`.                                                           |
| 6   | Error message includes type description                    | The thrown error message always describes the actual type received (e.g., `null`, `string`, `number`).                                     |
| 7   | Error message includes "Expected State object" for null    | When `null` is passed, the error message contains `"Expected State object"`.                                                               |
| 8   | validateState is deterministic                             | Calling `validateState` twice with the same input always produces the same outcome (success or the same error).                            |
| 9   | validateState succeeds if and only if isState returns true | `validateState(x)` succeeds exactly when `isState(x)` is `true`. The two functions are equivalent in their acceptance criteria.            |
| 10  | validateState works as a type assertion                    | After a successful call, TypeScript narrows the type to `State`. The runtime check and the compile-time type narrowing are always in sync. |

## Route Name Validators

| #   | Invariant                                                 | Description                                                                                                                                                  |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | validateRouteName accepts valid route names               | Valid route name patterns and system routes pass without throwing.                                                                                           |
| 2   | validateRouteName accepts empty string                    | An empty string (root node) passes without throwing.                                                                                                         |
| 3   | validateRouteName throws TypeError for non-strings        | Non-string values always cause a `TypeError` with `[router.methodName]` in the message.                                                                      |
| 4   | validateRouteName throws for whitespace-only strings      | Whitespace-only strings cause a `TypeError` with `"whitespace"` in the message.                                                                              |
| 5   | validateRouteName throws for strings exceeding max length | Strings over the length limit cause a `TypeError` with `"maximum length"` in the message.                                                                    |
| 6   | validateRouteName throws for consecutive dots             | Names containing `..` cause a `TypeError`.                                                                                                                   |
| 7   | Error message includes method name                        | The thrown error always contains `[router.methodName]`, identifying the call site.                                                                           |
| 8   | validateRouteName ↔ isRouteName bidirectional equivalence | `validateRouteName(x)` succeeds (does not throw) if and only if `isRouteName(x)` returns `true`. The validator and guard have identical acceptance criteria. |

## State Guard Decomposition

| #   | Invariant                       | Description                                                                                                                                                                                           |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | isState component decomposition | If `isState(x)` returns `true`, then `isRouteName(x.name)` is `true`, `typeof x.path` is `"string"`, and `isParams(x.params)` is `true`. The composite guard is consistent with its component guards. |

## Params Guard Behavioral Divergence

| #   | Invariant                                                   | Description                                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | isParams accepts nested objects that isParamsStrict rejects | For params containing nested plain objects, `isParams` returns `true` (recursive serializable check) while `isParamsStrict` returns `false` (only primitives and arrays of primitives allowed). This is the defining behavioral difference between the two guards. |

## Type Description Utilities

| #   | Invariant                                                 | Description                                                                                                                         |
| --- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | getTypeDescription returns "null" for null                | `null` always produces the string `"null"`, not `"object"`.                                                                         |
| 2   | getTypeDescription returns "undefined" for undefined      | `undefined` produces `"undefined"` via the `typeof` fallback.                                                                       |
| 3   | getTypeDescription returns array description with length  | For any array of length N, returns `"array[N]"`. The length is always accurate regardless of array contents.                        |
| 4   | getTypeDescription returns constructor name for instances | Class instances (`Date`, `Map`, `Set`, `RegExp`) return their constructor name. Only instances with a non-`"Object"` name qualify.  |
| 5   | getTypeDescription returns "object" for plain objects     | Plain objects (with `Object.prototype`) return `"object"`. Null-prototype objects also return `"object"`.                           |
| 6   | getTypeDescription returns typeof for primitives          | Strings → `"string"`, numbers → `"number"`, booleans → `"boolean"`. The `typeof` operator provides the description.                 |
| 7   | getTypeDescription returns "function" for functions       | Functions always produce `"function"` via the `typeof` fallback.                                                                    |
| 8   | getTypeDescription returns "symbol" for symbols           | Symbols produce `"symbol"` via the `typeof` fallback.                                                                               |
| 9   | getTypeDescription handles null-prototype objects         | Objects created with `Object.create(null)` return `"object"`. The `"constructor" in value` guard prevents errors on missing fields. |

## Test Files

| File                                                      | Invariants | Category                   |
| --------------------------------------------------------- | ---------- | -------------------------- |
| `tests/property/guards/primitives.properties.ts`          | 16         | Primitive Guards           |
| `tests/property/guards/params.properties.ts`              | 21         | Params Guards              |
| `tests/property/guards/params-edge-cases.properties.ts`   | 11         | Params Guards (edge cases) |
| `tests/property/guards/state.properties.ts`               | 12         | State Guards               |
| `tests/property/guards/state-edge-cases.properties.ts`    | 2          | State Guards (edge cases)  |
| `tests/property/guards/navigation.properties.ts`          | 11         | Navigation Guards          |
| `tests/property/guards/routes.properties.ts`              | 10         | Route Name Guards          |
| `tests/property/validators/state.properties.ts`           | 10         | State Validators           |
| `tests/property/validators/routes.properties.ts`          | 8          | Route Name Validators      |
| `tests/property/utilities/type-description.properties.ts` | 9          | Type Description Utilities |
