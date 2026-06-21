// packages/type-guards/modules/guards/params.ts

import type { Params } from "@real-router/types";

/**
 * Is `value` an array, or a plain object (`Object.prototype` / `null` prototype)?
 * Class instances (Date, RegExp, Map, Set, ...) are not plain containers.
 *
 * @internal
 */
function isPlainContainer(value: object): boolean {
  if (Array.isArray(value)) {
    return true;
  }

  const proto = Object.getPrototypeOf(value) as object | null;

  return proto === null || proto === Object.prototype;
}

/**
 * Pushes every child of an array or plain object onto the work-stack.
 *
 * @internal
 */
function pushChildren(value: object, stack: unknown[]): void {
  const children = Array.isArray(value) ? value : Object.values(value);

  for (const child of children) {
    stack.push(child);
  }
}

/**
 * Is `value` a serializable primitive leaf? `string` and `boolean` always are; a
 * `number` only if finite (NaN/Infinity are not). Everything else (function,
 * symbol, bigint) is not serializable.
 *
 * @internal
 */
function isSerializableLeaf(value: unknown): boolean {
  const type = typeof value;

  if (type === "string" || type === "boolean") {
    return true;
  }

  if (type === "number") {
    return Number.isFinite(value);
  }

  return false;
}

/**
 * Internal helper to check if value is serializable (no circular refs, functions, instances).
 * Validates the entire object tree with protection against circular references.
 *
 * Iterative (explicit work-stack) rather than recursive: a recursive walk overflows
 * the call stack with `RangeError` at ~2.4k levels of nesting on V8, which would break
 * the boolean contract on adversarial input reachable via `history.state` / user-supplied
 * params (#901). A heap-allocated stack scales to any depth. The `WeakSet` records every
 * visited object for the lifetime of the call, so any object reached twice — a cycle or a
 * shared reference — is rejected (cycle-detection semantics unchanged).
 *
 * @param root - Value to check
 * @returns true if value can be serialized
 * @internal
 */
function isSerializable(root: unknown): boolean {
  const stack: unknown[] = [root];
  const visited = new WeakSet<object>();

  while (stack.length > 0) {
    const value = stack.pop();

    // null/undefined are serializable (JSON.stringify handles them)
    if (value === null || value === undefined) {
      continue;
    }

    // Arrays and plain objects: reject cycles/shared refs and class instances,
    // then queue their children. (typeof null is "object", handled above.)
    if (typeof value === "object") {
      if (visited.has(value)) {
        return false; // circular / shared reference
      }

      if (!isPlainContainer(value)) {
        return false; // instance of a class
      }

      visited.add(value);
      pushChildren(value, stack);

      continue;
    }

    // Primitive leaf: string / boolean / finite number pass; function, symbol,
    // bigint, and NaN/Infinity do not.
    if (!isSerializableLeaf(value)) {
      return false;
    }
  }

  return true;
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
 * Internal helper for strict param value validation.
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
    return Number.isFinite(value);
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
 * Strict type guard for Params.
 * Accepts only plain objects (own `Object.prototype` or `null` prototype) whose
 * values are primitives or arrays of primitives — no nested objects. Like
 * {@link isParams}, it rejects class instances and custom-prototype objects, so
 * the lattice `isParamsStrict ⇒ isParams` holds.
 *
 * @param value - Value to check
 * @returns true if value is a valid Params object
 */
export function isParamsStrict(value: unknown): value is Params {
  // Check if value is an object (null returns "object" but fails Array.isArray and other checks)
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  // Reject objects with custom prototype (e.g., Object.create(proto), class instances).
  // Mirrors isParams (see above): without this, a class instance with no own
  // enumerable fields yields zero for..in iterations and would wrongly pass the
  // strict guard, breaking the lattice isParamsStrict ⇒ isParams (#785).
  const proto = Object.getPrototypeOf(value) as object | null;

  if (proto !== null && proto !== Object.prototype) {
    return false;
  }

  // Check all own properties have valid param values
  for (const key in value) {
    // With the proto === Object.prototype check above, inherited enumerable
    // properties can only come from Object.prototype pollution (defensive).
    /* v8 ignore next 3 -- @preserve Defensive: Object.prototype pollution */
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
