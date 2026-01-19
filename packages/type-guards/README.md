# type-guards

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

> Runtime type validation utilities for Router6 ecosystem.

**⚠️ Internal Use Only:** This package is designed for use within the Router6 monorepo. External users should use `router6` package directly.

Provides centralized type guards and validators for all Router6 core types with TypeScript type narrowing support.

## Features

- **Runtime type safety**: Validate types at runtime with TypeScript type narrowing
- **Strict & flexible modes**: Different validation levels for different use cases
- **Comprehensive coverage**: Guards for State, Params, NavigationOptions, and more
- **Well-tested**: 60+ test cases covering edge cases

## API

### Type Guards (is*)

Type guards return `boolean` and narrow TypeScript types.

#### Primitive Guards

```typescript
isString(value: unknown): value is string
isBoolean(value: unknown): value is boolean
isPromise(value: unknown): value is Promise<unknown>
isObjKey(key: string, obj: object): key is keyof typeof obj
isPrimitiveValue(value: unknown): value is string | number | boolean
```

#### Params Guards

```typescript
isParams(value: unknown): value is Params
isParamsStrict(value: unknown): value is Params
```

#### State Guards

```typescript
isState(value: unknown): value is State
isStateStrict(value: unknown): value is State
isHistoryState(value: unknown): value is HistoryState
```

#### Navigation Guards

```typescript
isNavigationOptions(value: unknown): value is NavigationOptions
isRouteName(value: unknown): value is string
```

### Validators (validate*)

Validators throw errors for invalid input, providing assertion-style validation.

```typescript
validateRouteName(name: unknown, methodName: string): asserts name is string
validateState(value: unknown): asserts value is State
```

### Utilities

```typescript
getTypeDescription(value: unknown): string  // Human-readable type description
```

## Usage in Router Packages

### Validating State

```typescript
import { isState, isStateStrict } from "type-guards";

// Quick presence check
if (isState(value)) {
  console.log(value.name, value.path);
}

// Deep validation with type checking
if (isStateStrict(value)) {
  // Validates params types, meta structure
  processState(value);
}
```

### Validating Params

```typescript
import { isParams, isParamsStrict } from "type-guards";

// Flexible validation - allows nested objects (real-router core)
if (isParams(routeParams)) {
  router.setState(routeParams);
}

// Strict validation - only primitives and arrays (browser plugin)
if (isParamsStrict(urlParams)) {
  window.history.pushState(urlParams, "", path);
}
```

### Route Validation (Assertion Functions)

```typescript
import { validateRouteName } from "type-guards";

function addRoute(name: unknown, path: string) {
  // Throws TypeError if invalid, narrows type if valid
  validateRouteName(name, "addRoute");

  // TypeScript now knows name is a string
  routes[name] = path;
}
```

### History State Validation (Browser Plugin)

```typescript
import { isHistoryState } from "type-guards";

const state = window.history.state;

if (!isHistoryState(state)) {
  return undefined;
}

// TypeScript knows state has meta object
return state;
```

## Validation Strategies

### `isParams` vs `isParamsStrict`

- **`isParams`**: Used in router6 core

  - Allows: primitives, arrays, nested objects
  - Use case: Internal state management

- **`isParamsStrict`**: Used in browser plugin
  - Allows: primitives, arrays of primitives only
  - Use case: URL serialization (no nested objects)
  - Rejects: `NaN`, `Infinity`, nested objects

### `isState` vs `isStateStrict`

- **`isState`**: Quick field presence check

  - Validates: `name`, `params`, `path` exist
  - Fast, minimal overhead

- **`isStateStrict`**: Deep type validation
  - Validates: field types, meta structure
  - Use case: Browser plugin, state serialization

## Edge Cases

The guards handle various edge cases:

```typescript
// Rejects NaN and Infinity
isPrimitiveValue(NaN); // false
isPrimitiveValue(Infinity); // false

// Handles null/undefined
isParamsStrict({ query: null, filter: undefined }); // true

// Inherited properties are not validated
const proto = { inherited: "value" };
const params = Object.create(proto);
params.own = "test";
isParamsStrict(params); // true - validates only own properties

// Handles frozen objects
const frozen = Object.freeze({ id: "123" });
isParams(frozen); // true
```

## Route Name Validation Rules

`isRouteName` validates:

- Non-empty string
- Segments: `[a-zA-Z_][a-zA-Z0-9_-]*`
- Dots (.) for hierarchy
- No consecutive, leading, or trailing dots
- System routes (@@prefix) bypass validation

```typescript
isRouteName("users.profile", "navigate"); // OK
isRouteName("admin_panel", "navigate"); // OK
isRouteName("api-v2", "navigate"); // OK
isRouteName("@@real-router/UNKNOWN", "navigate"); // OK - system route

isRouteName(".users", "navigate"); // throws - leading dot
isRouteName("users..profile", "navigate"); // throws - consecutive dots
isRouteName("123user", "navigate"); // throws - starts with number
```

## Route Path Validation Rules

`isRoutePath` validates:

- String type
- Empty path allowed (grouping/root)
- Must start with `/`, `~`, `?`, or be relative segment
- No double slashes
- Absolute paths (~) cannot be under parameterized parents

```typescript
isRoutePath("/users", "users", "add"); // OK
isRoutePath("~about", "about", "add"); // OK - absolute
isRoutePath("?query", "search", "add"); // OK - query
isRoutePath("", "root", "add"); // OK - empty

isRoutePath("//bad", "test", "add"); // throws - double slashes
```

## Documentation

Full documentation available on the [Router6 Wiki](https://github.com/greydragon888/router6/wiki):

- [State](https://github.com/greydragon888/router6/wiki/State) — state type validation
- [Params](https://github.com/greydragon888/router6/wiki/Params) — params type validation
- [NavigationOptions](https://github.com/greydragon888/router6/wiki/NavigationOptions) — navigation options validation

## Related Packages

- [router6](https://www.npmjs.com/package/router6) — core router implementation
- [router6-types](https://www.npmjs.com/package/router6-types) — TypeScript type definitions

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
