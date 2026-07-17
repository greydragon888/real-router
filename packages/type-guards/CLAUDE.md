# type-guards

Internal package providing runtime type guards and validators for the Real-Router ecosystem. Not published to npm -- consumed via `workspace:^` by the browser, hash, navigation, persistent-params, and validation plugins (and `shared/browser-env`). **Not** a dependency of `@real-router/core` (core uses its own structural guards).

## Exports

| Export                                | Kind      | Description                                                                                                              |
| ------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| `isString(value)`                     | Guard     | Narrows to `string`                                                                                                      |
| `isBoolean(value)`                    | Guard     | Narrows to `boolean`                                                                                                     |
| `isObjKey(key, obj)`                  | Guard     | Narrows key to `Extract<keyof T, string>`                                                                                |
| `isPrimitiveValue(value)`             | Guard     | Narrows to `string \| number \| boolean`; rejects NaN/Infinity                                                           |
| `isParams(value)`                     | Guard     | Checks value is a plain params object                                                                                    |
| `isParamsStrict(value)`               | Guard     | Strict params: plain object with primitive / array-of-primitive values only (rejects nested objects and class instances) |
| `isRouteName(value)`                  | Guard     | Checks value is a valid route name string                                                                                |
| `isNavigationOptions(value)`          | Guard     | Checks value is a valid navigation options object                                                                        |
| `isState(value)`                      | Guard     | Checks required fields: name, params, path                                                                               |
| `isStateStrict(value)`                | Guard     | Deep validation of State structure and field types                                                                       |
| `validateRouteName(name, methodName)` | Validator | Asserts valid route name or throws TypeError                                                                             |
| `validateState(state, method)`        | Validator | Asserts valid State structure or throws TypeError                                                                        |
| `getTypeDescription(value)`           | Utility   | Human-readable type string for error messages                                                                            |

## API Pattern

- **Guards (`is*`)** -- return `boolean`, narrow TypeScript types via type predicates
- **Validators (`validate*`)** -- throw `TypeError` with contextual error messages, use `asserts` return type
- Validators delegate to guards internally; `validateState` calls `isState`, `validateRouteName` uses internal regex constants

## Module Structure

```
src/
├── guards/
│   ├── primitives.ts   -- isString, isBoolean, isObjKey, isPrimitiveValue
│   ├── params.ts       -- isParams, isParamsStrict
│   ├── routes.ts       -- isRouteName
│   ├── navigation.ts   -- isNavigationOptions
│   ├── state.ts        -- isState, isStateStrict
│   └── index.ts        -- re-exports all guards
├── validators/
│   ├── routes.ts       -- validateRouteName (regex, length, system route bypass)
│   ├── state.ts        -- validateState
│   └── index.ts        -- re-exports all validators
├── utilities/
│   └── type-description.ts -- getTypeDescription (for error messages)
├── internal/
│   ├── router-error.ts -- createRouterError, regex constants, MAX_ROUTE_NAME_LENGTH
│   └── meta-fields.ts  -- isRequiredFields (shared by state guards)
└── index.ts            -- public API re-exports
```

## Gotchas

- **`isPrimitiveValue` rejects NaN/Infinity** -- uses `Number.isFinite()` for numbers, since these are not valid URL parameter values
- **`validateRouteName` allows empty string** -- `""` is the valid root node name, not an error
- **System routes bypass validation** -- names starting with `@@` (e.g., `@@router/UNKNOWN_ROUTE`) skip pattern checks in `validateRouteName`
- **Depends on `@real-router/types`** -- imports `Params`, `State`, and other type definitions; no runtime dependency on core
- **`isParams` validates iteratively (no stack overflow)** -- the slow path (`isSerializable`) walks nested params with an explicit work-stack, not recursion, so it returns a boolean at any nesting depth instead of throwing `RangeError` on deep adversarial input (`history.state`, user params). It runs at the validation boundary on untrusted input, so depth must not be a crash vector (#901)
- **Never-crash on a throwing accessor (#1052)** -- `getTypeDescription` (its `constructor`/`.name` read) and `isParams`/`isParamsStrict` (their structural walk, via the `isParamsUnsafe`/`isParamsStrictUnsafe` inner functions) wrap their property reads in `try/catch`, so an adversarial **throwing accessor** — a `constructor`/`.name` getter that throws, or a `Proxy` that throws on `[[Get]]` — yields the documented fallback (`"object"` / `false`), never the caller's exception. The throwing-*getter* sibling of the #787 adversarial-*value* hardening. Reachable only via `@real-router/validation-plugin`'s always-on validators (core does not depend on type-guards). `route-tree` carries a byte-identical twin of `getTypeDescription` hardened in lockstep
- **Property-based tests** -- `tests/property/` contains fast-check generative tests for guards and validators
- **Stress tests** -- `tests/stress/` guards robustness (deep nesting → no overflow) and anti-quadratic scaling (`WeakSet` O(1) membership) on untrusted input; run via `pnpm -F type-guards test:stress` (also part of `pnpm build`, not PR CI)
- **White-box guardrail (functional tests via public API only)** -- `eslint.config.mjs` bans `src/*` imports in `tests/functional/**/*.test.ts` (`no-restricted-imports`), so a functional test can only exercise the `type-guards` package index -- never an internal (`isSerializable`/params slow-path helpers, `isValidParamValueStrict`, `isRequiredFields`, the `internal/router-error` constants). This makes any publicly-unreachable code surface as an **uncovered branch** rather than being killed from the inside (the honesty invariant: green functional test ⟺ real consumer guarantee). The **allowlist is empty and started empty** -- the 2026-07-17 whitebox audit found the functional suite already 100%-public with 100% coverage of every src module, so there is nothing to exempt; the rule locks that state in. Internal pure functions that need direct testing go to `tests/property/` (exempt); genuinely-unreachable branches would get a documented `ignores:` entry. Mirrors `packages/core` + `packages/path-matcher`
