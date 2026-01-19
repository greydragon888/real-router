// packages/type-guards/modules/guards/params.ts

import type { Params } from "router6-types";

/**
 * Internal helper to check if value is serializable (no circular refs, functions, instances).
 * Recursively validates the entire object tree with protection against circular references.
 *
 * @param value - Value to check
 * @param visited - Set of visited objects to detect circular references
 * @returns true if value can be serialized
 * @internal
 */
function isSerializable(
  value: unknown,
  visited = new WeakSet<object>(),
): boolean {
  // null/undefined are serializable (JSON.stringify handles them)
  if (value === null || value === undefined) {
    return true;
  }

  const type = typeof value;

  // Primitives: string, boolean
  if (type === "string" || type === "boolean") {
    return true;
  }

  // Numbers: must be finite (reject NaN and Infinity)
  if (type === "number") {
    return Number.isFinite(value);
  }

  // Functions and symbols cannot be serialized
  if (type === "function" || type === "symbol") {
    return false;
  }

  // Arrays (including nested arrays)
  if (Array.isArray(value)) {
    // Circular reference detection
    if (visited.has(value)) {
      return false;
    }

    visited.add(value);

    // Recursively check all items
    return value.every((item) => isSerializable(item, visited));
  }

  // Objects
  if (type === "object") {
    // Circular reference detection
    if (visited.has(value)) {
      return false;
    }

    // Add to visited set
    visited.add(value);

    // Only allow plain objects (reject Date, RegExp, Map, Set, etc.)
    const proto = Object.getPrototypeOf(value) as object | null;

    if (proto !== null && proto !== Object.prototype) {
      return false; // Instance of a class
    }

    // Recursively check all values
    return Object.values(value).every((v) => isSerializable(v, visited));
  }

  return false;
}

/**
 * Fast path check for primitive values (no recursion needed).
 * Returns true if primitive, false if needs deeper inspection.
 *
 * @internal
 */
function isPrimitiveValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  const type = typeof value;

  if (type === "string" || type === "boolean") {
    return true;
  }

  if (type === "number") {
    return Number.isFinite(value);
  }

  // object, array, function, symbol — need deeper check
  return false;
}

/**
 * Type guard for Params object.
 * Validates that all values are serializable (primitives, arrays, nested arrays, or nested objects).
 * Rejects circular references, functions, symbols, and class instances.
 * Allows null/undefined anywhere (objects and arrays).
 *
 * Performance optimization: Uses two-phase validation.
 * Phase 1 (fast path): Check if all values are primitives — O(p) without recursion.
 * Phase 2 (slow path): Full recursive validation only if nested structures detected.
 *
 * @param value - Value to check
 * @returns true if value is a valid Params object
 *
 * @example
 * // Valid
 * isParams({ id: '123', page: 1 }); // true (fast path)
 * isParams({ sort: ['name', 'age'] }); // true (slow path)
 * isParams({ filter: { status: 'active' } }); // true (slow path)
 * isParams({ teamId: null, orgId: undefined }); // true (fast path)
 * isParams({ matrix: [[1, 2], [3, 4]] }); // true (slow path)
 * isParams({ users: [{ id: 1 }, { id: 2 }] }); // true (slow path)
 * isParams({ scores: [100, null, 85] }); // true (slow path)
 *
 * // Invalid
 * isParams({ fn: () => {} }); // false (function)
 * isParams({ date: new Date() }); // false (class instance)
 * isParams({ self: circularRef }); // false (circular reference)
 * isParams(null); // false (not an object)
 * isParams([]); // false (array, not object)
 */
export function isParams(value: unknown): value is Params {
  // Reject null, undefined, and arrays (must be a plain object)
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  // Reject objects with custom prototype (e.g., Object.create(proto), class instances)
  // This check is required for both fast and slow paths
  const proto = Object.getPrototypeOf(value) as object | null;

  if (proto !== null && proto !== Object.prototype) {
    return false;
  }

  // Phase 1: Fast path for flat objects (95%+ of real-world params)
  // Check if all values are primitives — no recursion, no WeakSet allocation
  let needsDeepCheck = false;

  for (const key in value) {
    // Skip inherited properties (only check own properties for fast path)
    // Note: With proto === Object.prototype check above, inherited properties
    // would only come from Object.prototype, which has no enumerable properties.
    // This check is defensive against Object.prototype pollution.
    /* v8 ignore next 3 -- @preserve Defensive: Object.prototype pollution */
    if (!Object.hasOwn(value, key)) {
      continue;
    }

    const val = (value as Record<string, unknown>)[key];

    if (!isPrimitiveValue(val)) {
      // Found non-primitive — need full validation
      // But first check for obvious invalids (functions, symbols)
      const type = typeof val;

      if (type === "function" || type === "symbol") {
        return false; // Early reject
      }

      needsDeepCheck = true;

      break; // Exit fast path, proceed to slow path
    }
  }

  // Fast path: all primitives, valid params
  if (!needsDeepCheck) {
    return true;
  }

  // Phase 2: Slow path — full recursive validation
  return isSerializable(value);
}

/**
 * Internal helper for strict param validation (browser plugin).
 * Only allows primitives and arrays of primitives, no nested objects.
 *
 * @param value - Value to check
 * @returns true if value is valid
 * @internal
 */
export function isValidParamValueStrict(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  const type = typeof value;

  // Primitives: string, boolean, finite number
  if (type === "string" || type === "boolean") {
    return true;
  }

  if (type === "number") {
    return Number.isFinite(value as number);
  }

  // Arrays of primitives only
  if (Array.isArray(value)) {
    return value.every((item) => {
      const itemType = typeof item;

      // Primitives: string, boolean, finite number
      if (itemType === "string" || itemType === "boolean") {
        return true;
      }

      if (itemType === "number") {
        return Number.isFinite(item);
      }

      // Reject everything else (objects, arrays, functions, symbols, etc.)
      return false;
    });
  }

  // Reject objects, functions, symbols, etc.
  return false;
}

/**
 * Strict type guard for Params (browser plugin version).
 * Only allows primitives and arrays of primitives, no nested objects.
 *
 * @param value - Value to check
 * @returns true if value is a valid Params object
 */
export function isParamsStrict(value: unknown): value is Params {
  // Check if value is an object (null returns "object" but fails Array.isArray and other checks)
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  // Check all own properties have valid param values
  for (const key in value) {
    if (!Object.hasOwn(value, key)) {
      continue; // Skip inherited properties
    }

    const val = (value as Record<string, unknown>)[key];

    if (!isValidParamValueStrict(val)) {
      return false;
    }
  }

  return true;
}
