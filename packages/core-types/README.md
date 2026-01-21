# core-types

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

Central type definition package for Real-Router monorepo. Provides shared TypeScript types to eliminate circular dependencies.

**⚠️ Internal Use Only:** This package is designed exclusively for use within the Real-Router monorepo. External users should import types directly from `@real-router/core` package.

## Purpose

This package was extracted to serve as a central type hub:

1. **Break circular dependencies** - all packages need shared types without importing @real-router/core
2. **Single source of truth** - all type definitions in one place
3. **Consistent types** - all packages use identical type definitions
4. **Type-only package** - zero runtime code, pure TypeScript definitions

## Architecture

### Package Structure

```
core-types/
├── src/
│   ├── base.ts              # Core types: State, Params, NavigationOptions, RouterError
│   ├── router.ts            # Router interface and related types
│   ├── constants.ts         # Event and error code type definitions
│   ├── route-node-types.ts  # RouteTree integration types
│   └── index.ts             # Public exports
└── tsconfig.json
```

### Dependencies

This package has **minimal external dependencies** by design:
- `@real-router/route-tree` - for RouteNode types (needed for State types)

Packages that depend on `core-types`:
- `@real-router/core` - main consumer
- `@real-router/type-guards` - for type guard return types
- `@real-router/react` - for hook return types
- `@real-router/helpers` - for State type
- All plugin packages

### Dependency Graph

```
core-types (depends on @real-router/route-tree for RouteNode types)
    ↓
    ├── @real-router/type-guards (depends on core-types)
    ├── @real-router/helpers (depends on core-types)
    └── @real-router/core (depends on core-types)
        ↓
        └── plugins (depend on core-types + @real-router/core)
            ↓
            └── @real-router/react (depends on @real-router/core + plugins)
```

## Key Design Decisions

### 1. Type-Only Package

This package contains **zero runtime code**. All exports are `export type`. This was chosen because:

- Prevents accidental runtime dependencies
- Ensures types are stripped in production builds
- Clarifies this package's role as pure type definitions
- Enables tree-shaking (no runtime code to bundle)

**Maintenance note:** Never add runtime code to this package. If you need runtime utilities, create a separate package.

### 2. Interface vs Type Aliases

The package uses **interfaces for object shapes** and **type aliases for unions/primitives**. This was chosen because:

- Interfaces have better error messages in TypeScript
- Interfaces can be extended and augmented
- Type aliases are better for unions and mapped types
- Consistency across the codebase

**Maintenance note:** Use `interface` for Router, State, Options, etc. Use `type` for union types like EventsKeys.

### 3. Generic Type Parameters

Types like `State`, `Router`, and `Params` use generics for extensibility:

```typescript
interface State<P extends Params = Params, MP extends Params = Params> {
  name: string;
  params: P;
  path: string;
  meta?: StateMeta<MP>;
}
```

This design:
- Allows type-safe custom params
- Preserves type information through function calls
- Enables strict typing in consuming code
- Defaults to base Params when not specified

**Maintenance note:** When adding generic parameters, always provide defaults for backward compatibility.

### 4. RouterError as Interface

`RouterError` is defined as an **interface** in this package, but **implemented as a class** in `@real-router/core` package. This split:

- Avoids circular dependency (types don't depend on implementation)
- Enables type checking without importing the class
- Separates type contracts from implementation

**Maintenance note:** When adding methods to RouterError class, update the interface in `src/base.ts`.

### 5. Const Type Mappings

Event and error code mappings use `interface` with `readonly` instead of `const` objects:

```typescript
interface EventToNameMap {
  ROUTER_START: "$start";
  ROUTER_STOP: "$stop";
  // ...
}
```

This design:
- Provides type-level mappings without runtime overhead
- Enables type inference in mapped types
- Better than enums (no const enum issues)
- Completely eliminated in compiled JavaScript

**Maintenance note:** Keep type mappings in sync with actual constant values in `@real-router/core` package.

## Common Maintenance Tasks

### Adding a New Base Type

1. Add type definition to `src/base.ts`
2. Export from `src/index.ts`
3. Update this README if it's a major addition
4. Update consuming packages as needed
5. Run type-check across all packages

Example:
```typescript
// base.ts
export interface NewType {
  field: string;
}

// index.ts
export type { NewType } from './base';
```

### Adding a Router Method

1. Add method signature to `Router` interface in `src/router.ts`
2. Add JSDoc documentation
3. Implement the method in `@real-router/core` package
4. Add tests in `@real-router/core` package
5. Update @real-router/core README

**Important:** The type must come first. Implementation in `@real-router/core` must match exactly.

### Modifying State Interface

**⚠️ Be extremely careful** - State is used everywhere.

1. Check all consuming packages for compatibility
2. Consider adding optional fields instead of required
3. Update `@real-router/type-guards` package validators
4. Update serialization logic in plugins
5. Test with browser plugin (URL serialization)
6. Coordinate changes across packages in same PR

### Adding Event or Error Code Types

1. Add type to union in `src/constants.ts`
2. Add mapping entry to relevant interface
3. Add actual constant in `@real-router/core/src/constants.ts`
4. Update error or event handling logic
5. Update documentation

Example:
```typescript
// constants.ts
export type EventsKeys =
  | "ROUTER_START"
  | "NEW_EVENT"  // Add here
  // ...

export interface EventToNameMap {
  ROUTER_START: "$start";
  NEW_EVENT: "$$new";  // Add here
}
```

## Type Organization

### Base Types (base.ts)

Foundation types used across all packages:
- `State` - router state representation
- `SimpleState` - minimal state with name and params
- `StateMeta` - state metadata (id, params, options, redirected)
- `StateMetaInput` - input type for makeState meta parameter
- `Params` - route parameters
- `NavigationOptions` - navigation behavior control
- `RouterError` - error interface (implementation in @real-router/core)
- Callback types: `DoneFn`, `Unsubscribe`, `CancelFn`

### Router Types (router.ts)

Router-specific types:
- `Router` - main router interface
- `Route` - route definition
- `Options` - router configuration
- `Config` - internal router configuration
- `Plugin` / `PluginFactory` - plugin system
- `Middleware` / `MiddlewareFactory` - middleware system
- `ActivationFn` / `ActivationFnFactory` - guard functions
- `SubscribeState` / `SubscribeFn` - subscription types
- `Listener` / `Subscription` - observable support
- `DefaultDependencies` - dependency injection base type
- `BuildStateResultWithSegments` - internal state building result

### Constants Types (constants.ts)

Type-level constants:
- Event type definitions (`EventsKeys`, `EventName`)
- Error code definitions (`ErrorCodeKeys`, `ErrorCodeValues`)
- Type mappings: `EventToPluginMap`, `EventToNameMap`, `ErrorCodeToValueMap`
- Plugin method type: `PluginMethod`

### Route Node Types (route-node-types.ts)

Integration with @real-router/route-tree package:
- `QueryParamsMode` - query parameter handling modes
- `QueryParamsOptions` - query parameter configuration
- `RouteTreeState` - route tree state representation

## Testing

This package has **no tests** because:
- It's pure TypeScript definitions with no runtime code
- Type correctness is verified by TypeScript compiler
- Integration is tested in consuming packages

**Type checking:**
```bash
pnpm run type-check       # Verify types compile
pnpm run build            # Build type declarations
```

**Important:** Run type-check across all packages when making changes:
```bash
# In monorepo root
pnpm run type-check --filter=./packages/*
```

## Breaking Changes Policy

Since this is a foundational package used by all others:

- **Breaking changes are expensive** - require updates to all consumers
- **Avoid breaking changes** in minor versions
- **Coordinate carefully** when breaking changes are necessary
- **Update all consumers in same PR** - types and implementations together
- **Consider deprecation path** - add new types, mark old ones `@deprecated`

### Examples of Breaking Changes

- Removing a type
- Renaming a type or field
- Changing a required field to have different type
- Removing a generic parameter
- Changing method signature in Router interface

### Examples of Non-Breaking Changes

- Adding a new type
- Adding optional field to existing type
- Adding generic parameter with default
- Adding method to Router interface
- Widening a union type
- Making required field optional

## Performance Considerations

This package has **zero runtime performance impact** because:

- All types are erased at compile time
- No JavaScript code is generated
- No bundle size impact
- Type checking happens at build time only

However, **type complexity affects build performance**:

- Avoid deeply nested conditional types
- Avoid excessive type unions (affects type checking speed)
- Keep generic constraints simple
- Use `interface extends` over type intersections when possible

## Future Considerations

### Potential Improvements

1. **Stricter Params typing** - consider discriminated unions for different param types
2. **Readonly by default** - make State and Params readonly to enforce immutability
3. **Branded types** - use branded types for route names to prevent mixing
4. **Effect types** - add types for async effects and cancellation

### Known Limitations

1. **Index signatures** - Router interface uses `[key: string]: unknown` for plugin methods
2. **Params flexibility** - Params type is very permissive (allows nested objects)
3. **Generic inference** - TypeScript can't always infer generic params automatically
4. **No runtime validation** - types don't prevent invalid runtime values

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — main router implementation
- [@real-router/react](https://www.npmjs.com/package/@real-router/react) — React integration
- [@real-router/type-guards](https://www.npmjs.com/package/@real-router/type-guards) — runtime type validation
- [@real-router/route-tree](https://www.npmjs.com/package/@real-router/route-tree) — route tree parsing

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
