// packages/type-guards/modules/index.ts

/**
 * Centralized type guards and validators for Real Router ecosystem.
 *
 * This package provides runtime type validation utilities:
 * - Type guards (is*): Return boolean, narrow types
 * - Validators (validate*): Throw errors, provide assertions
 */

// ============================================================================
// Type Guards (is*)
// ============================================================================

// Re-export all guards from guards/
export {
  // Primitives
  isString,
  isBoolean,
  isPromise,
  isObjKey,
  isPrimitiveValue,
  // Params
  isParams,
  isParamsStrict,
  // Routes
  isRouteName,
  // Navigation
  isNavigationOptions,
  // State
  isState,
  isStateStrict,
  isHistoryState,
} from "./guards";

// ============================================================================
// Validators (validate*)
// ============================================================================

// Re-export all validators from validators/
export {
  // Routes
  validateRouteName,
  // State
  validateState,
} from "./validators";

// ============================================================================
// Utilities
// ============================================================================

// Internal utilities exposed for debugging/testing
export { getTypeDescription } from "./utilities/type-description";
