// packages/validation-plugin/src/type-guards/index.ts

/**
 * Type guards and validators consumed by validation-plugin.
 *
 * Dissolved from the former private `type-guards` package (M1): the symbols the
 * plugin actually imports now live here, next to their only consumer. `isRouteName`
 * (guards/routes.ts) and `isRequiredFields` (internal/meta-fields.ts) are NOT
 * re-exported — they are internal helpers of `isState`. `isStateStrict` lives in
 * shared/browser-env/state-guard.ts (its only consumers are the browser/hash
 * plugins); `isPrimitiveValue` lives in persistent-params-plugin.
 */

// Type Guards (is*)
export { isString, isBoolean, isObjKey } from "./guards/primitives";

export { isParams } from "./guards/params";

export { isNavigationOptions } from "./guards/navigation";

export { isState } from "./guards/state";

// Validators (validate*)
export { validateRouteName } from "./validators/routes";

// Utilities
export { getTypeDescription } from "./utilities/type-description";
