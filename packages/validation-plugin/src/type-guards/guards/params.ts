// packages/validation-plugin/src/type-guards/guards/params.ts

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
 * Marker pushed onto the work-stack after a container's children. Popping it
 * means that container's whole subtree has been validated, so the container
 * leaves the active DFS path (`onPath`) and joins the fully-checked set
 * (`done`). A module-private class, so user data can never be mistaken for it.
 *
 * @internal
 */
class SubtreeExit {
  constructor(readonly container: object) {}
}

/**
 * Inspects one container popped from the work-stack. Rejects cycles (a back-edge
 * to a container still on the current DFS path) and class instances; skips
 * already-validated shared references; otherwise marks the container on-path and
 * queues its children plus a {@link SubtreeExit} marker.
 *
 * @returns false only when the container is invalid (cycle or class instance)
 * @internal
 */
function visitContainer(
  value: object,
  stack: unknown[],
  onPath: WeakSet<object>,
  done: WeakSet<object>,
): boolean {
  if (onPath.has(value)) {
    return false; // back-edge → genuine circular reference
  }

  if (done.has(value)) {
    return true; // shared reference / diamond — subtree already validated
  }

  if (!isPlainContainer(value)) {
    return false; // instance of a class
  }

  onPath.add(value);
  stack.push(new SubtreeExit(value));
  pushChildren(value, stack);

  return true;
}

/**
 * Internal helper to check if value is serializable (no circular refs, functions, instances).
 * Validates the entire object tree.
 *
 * Iterative (explicit work-stack) rather than recursive: a recursive walk overflows
 * the call stack with `RangeError` at ~2.4k levels of nesting on V8, which would break
 * the boolean contract on adversarial input reachable via `history.state` / user-supplied
 * params (#901). A heap-allocated stack scales to any depth.
 *
 * Cycle detection uses on-path (DFS gray/black) semantics, not "ever-visited":
 * `onPath` holds the containers on the current branch — a back-edge to one of them is
 * a genuine cycle and is rejected; `done` holds containers whose subtree is already
 * fully validated. A shared reference / diamond (the same object reached again *off*
 * the current path) is serializable — `JSON.stringify` duplicates it — so it is
 * accepted, and `done` makes the re-encounter O(1), keeping the walk linear on diamond
 * chains instead of exponential (#786). Genuine cycles stay rejected: the cycle vertex
 * is still on the path when re-encountered.
 *
 * @param root - Value to check
 * @returns true if value can be serialized
 * @internal
 */
function isSerializable(root: unknown): boolean {
  const stack: unknown[] = [root];
  const onPath = new WeakSet<object>();
  const done = new WeakSet<object>();

  while (stack.length > 0) {
    const value = stack.pop();

    // Subtree fully processed: leave the current path, mark as validated.
    if (value instanceof SubtreeExit) {
      onPath.delete(value.container);
      done.add(value.container);

      continue;
    }

    // null/undefined are serializable (JSON.stringify handles them)
    if (value === null || value === undefined) {
      continue;
    }

    // Arrays and plain objects (typeof null is "object", handled above).
    if (typeof value === "object") {
      if (!visitContainer(value, stack, onPath, done)) {
        return false;
      }

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
 * isParams({ a: shared, b: shared }); // true (shared reference / diamond, not a cycle)
 *
 * // Invalid
 * isParams({ fn: () => {} }); // false (function)
 * isParams({ date: new Date() }); // false (class instance)
 * isParams({ self: circularRef }); // false (circular reference)
 * isParams(null); // false (not an object)
 * isParams([]); // false (array, not object)
 */
export function isParams(value: unknown): value is Params {
  // Getter-safe boundary (#1052): a throwing `[[Get]]` (a value getter that
  // throws, or a Proxy trap) during the structural walk below must not crash —
  // an object whose structure cannot even be read is not valid params. Mirrors
  // the never-throw contract of #786/#901 (deep nesting / cycles), for a throwing
  // accessor. Wraps the whole walk (proto read, fast-path value reads, and the
  // recursive isSerializable slow path) in one boundary.
  try {
    return isParamsUnsafe(value);
  } catch {
    return false;
  }
}

function isParamsUnsafe(value: unknown): value is Params {
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
    // This check is defensive against Object.prototype pollution — covered by the
    // prototype-pollution test, which surfaces an inherited enumerable key here.
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
