// shared/browser-env/state-guard.ts

import type { Params, State } from "@real-router/core";

/**
 * `isStateStrict` — the `history.state` shape guard, re-exported as `isState` by
 * browser-plugin and hash-plugin and consumed by `popstate-utils`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LOCKSTEP TWIN (M1 — dissolution of the former private `type-guards` package).
 * The state guard's transitive closure — `isRequiredFields`, `isRouteName`,
 * `isParams` and its serialization machinery, plus the two route-name
 * constants — is DUPLICATED here from
 * `packages/validation-plugin/src/type-guards/` because the two homes share no
 * common dependency (browser-env is a symlinked shared source consumed by the
 * URL plugins; it must not depend on validation-plugin). This mirrors the
 * `getTypeDescription` twin between `type-guards` and `engine` (#903/#1052): one
 * behavioural contract, two byte-identical copies. **Any change to the guard
 * semantics here MUST be mirrored in validation-plugin's copy and vice versa.**
 * Only `isStateStrict` is exported — the helpers are module-private.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Route-name constants (twin of type-guards internal/router-error.ts) ──────

/**
 * Pattern for complete route validation (all segments at once).
 * Each segment must start with letter/underscore, followed by
 * alphanumeric/hyphen/underscore; segments joined by dots.
 */
// eslint-disable-next-line security/detect-unsafe-regex -- safe: each `(?:\.…)*` repetition is anchored by a literal `.`, which `[\w-]*` cannot match, so the inner/outer quantifiers consume disjoint classes — no catastrophic backtracking (safe-regex over-flags the nested `*`).
const FULL_ROUTE_PATTERN = /^[A-Z_a-z][\w-]*(?:\.[A-Z_a-z][\w-]*)*$/;

/**
 * Maximum route name length to prevent DoS and performance issues.
 * Technical limit, not a business constraint.
 */
const MAX_ROUTE_NAME_LENGTH = 10_000;

/**
 * Type guard that checks if a value is a valid route name (twin of
 * type-guards guards/routes.ts `isRouteName`). Empty string is the root node;
 * `@@`-prefixed system routes bypass the pattern.
 */
function isRouteName(name: unknown): name is string {
  if (typeof name !== "string") {
    return false;
  }

  // Empty string is valid (represents root node)
  if (name === "") {
    return true;
  }

  // Too long is invalid
  if (name.length > MAX_ROUTE_NAME_LENGTH) {
    return false;
  }

  // System routes are valid (bypass pattern validation)
  if (name.startsWith("@@")) {
    return true;
  }

  // Regular routes must match pattern
  return FULL_ROUTE_PATTERN.test(name);
}

// ── isParams + serialization machinery (twin of type-guards guards/params.ts) ─

/**
 * Is `value` an array, or a plain object (`Object.prototype` / `null` prototype)?
 * Class instances (Date, RegExp, Map, Set, ...) are not plain containers.
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
 */
function pushChildren(value: object, stack: unknown[]): void {
  const children = Array.isArray(value) ? value : Object.values(value);

  for (const child of children) {
    stack.push(child);
  }
}

/**
 * Is `value` a serializable primitive leaf? `string` and `boolean` always are; a
 * `number` only if finite. Everything else (function, symbol, bigint) is not.
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
 * Marker pushed onto the work-stack after a container's children; popping it
 * means that container's subtree is validated. A module-private class, so user
 * data can never be mistaken for it.
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
 * Internal helper to check if value is serializable (no circular refs, functions,
 * instances). Iterative (explicit work-stack) rather than recursive so it scales
 * to any nesting depth (#901); on-path (DFS gray/black) cycle detection accepts
 * shared references / diamonds while rejecting genuine cycles (#786).
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
 * Type guard for Params object. Validates that all values are serializable
 * (primitives, arrays, nested arrays, or nested objects). Rejects circular
 * references, functions, symbols, and class instances. Two-phase: a fast path
 * for flat primitive objects, a recursive slow path for nested structures.
 * Getter-safe (#1052): a throwing `[[Get]]` during the walk → not valid params.
 */
function isParams(value: unknown): value is Params {
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
  const proto = Object.getPrototypeOf(value) as object | null;

  if (proto !== null && proto !== Object.prototype) {
    return false;
  }

  // Phase 1: Fast path for flat objects (all values are primitives)
  let needsDeepCheck = false;

  for (const key in value) {
    // Skip inherited properties (defensive against Object.prototype pollution).
    if (!Object.hasOwn(value, key)) {
      continue;
    }

    const val = (value as Record<string, unknown>)[key];

    if (!isPrimitiveValue(val)) {
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

// ── isRequiredFields + isStateStrict (twin of meta-fields.ts / state.ts) ─────

/**
 * Type guard helper that checks if required State fields have valid types
 * (twin of type-guards internal/meta-fields.ts `isRequiredFields`).
 */
function isRequiredFields(obj: Record<string, unknown>): boolean {
  return (
    isRouteName(obj.name) &&
    typeof obj.path === "string" &&
    isParams(obj.params)
  );
}

/**
 * Type guard for State. Performs the required-field check (`name` via
 * `isRouteName`, `path` is a string, `params` via `isParams`) — the "Strict" in
 * the name is historical: there is no deeper meta-field validation, and `meta.id`
 * is intentionally NOT type-checked (history.state restores serialize it as a
 * string). Re-exported as `isState` by the browser and hash plugins for
 * validating `history.state`.
 *
 * @param value - Value to check
 * @returns true if value has the required State fields with valid types
 *
 * @example
 * isStateStrict({ name: 'home', params: {}, path: '/' }); // true
 * isStateStrict({ name: 'home', params: 'invalid', path: '/' }); // false
 */
export function isStateStrict<P extends Params = Params>(
  value: unknown,
): value is State<P> {
  // Basic structure check
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check required fields and their types
  return isRequiredFields(obj);
}
