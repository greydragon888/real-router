// shared/browser-env/state-guard.ts

import type { Params, SearchParams } from "@real-router/core";

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ All three DECIDE, and this file's verdict is what they decide — so read off
 * the live global they are the guard's weakest point, not its input. Measured by
 * re-pointing each AFTER boot, all three FAIL OPEN: the guard starts accepting
 * what it exists to refuse.
 *
 *     Object.getPrototypeOf -> null   a Date instance is ACCEPTED into params
 *     Object.values         -> []     a nested function is ACCEPTED
 *     Object.hasOwn         -> false  the own-key filter is skipped
 *
 * That is a sharper profile than core's raw reads, which mostly degrade toward
 * refusal or a wrong-but-loud outcome.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does NOT close it — a shim evaluated ahead of the module still wins
 * (#1798). That caveat is core's own, in `guards.ts`, and it travels with the
 * doctrine rather than being an argument against it.
 *
 * ⚠ LOCKSTEP: these names are referenced from functions this file shares
 * byte-for-byte with its twin, so the block must exist identically in both.
 */
const getPrototypeOf = Object.getPrototypeOf;
const objectValues = Object.values;
const hasOwn = Object.hasOwn;

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

  const proto = getPrototypeOf(value) as object | null;

  return proto === null || proto === Object.prototype;
}

/**
 * Pushes every child of an array or plain object onto the work-stack.
 */
function pushChildren(value: object, stack: unknown[]): void {
  const children = Array.isArray(value) ? value : objectValues(value);

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
  const proto = getPrototypeOf(value) as object | null;

  if (proto !== null && proto !== Object.prototype) {
    return false;
  }

  // Phase 1: Fast path for flat objects (all values are primitives)
  let needsDeepCheck = false;

  for (const key in value) {
    // Skip inherited properties (defensive against Object.prototype pollution).
    if (!hasOwn(value, key)) {
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
/**
 * What a `history.state` entry must carry to be RESTORABLE — a strict subset of
 * `State`, and deliberately not `State` itself (#1838).
 *
 * ⚠ `isStateStrict` used to assert `value is State<P>` while checking three of
 * `State`'s six members, and the gap was reachable: `popstate-utils` reads
 * `state.search` on the line after the guard passes and hands it to
 * `makeState`. Measured end to end, a `search` of `"NOT-AN-OBJECT"` committed a
 * state whose query channel had one key PER CHARACTER (`"0"`…`"12"`), with
 * `state.path` unchanged and nothing downstream complaining.
 *
 * ⚑ `search` is OPTIONAL here and that is not laxity: entries written before
 * RFC-4 M2 (#1548) have no query channel at all, and `makeState` reuses the
 * frozen empty bag for them. Requiring it would break every pre-M2 Back.
 */
export interface RestorableEntry<P extends Params = Params> {
  readonly name: string;
  readonly params: P;
  readonly path: string;
  readonly search?: SearchParams;
}

/**
 * A member `State` declares that a restored entry may omit — but must not carry
 * with the wrong type.
 *
 * ⚠ Arrays are refused explicitly. `typeof [] === "object"`, so a bare
 * object-check admits one, and an array `search` reaches `makeState` as a bag of
 * numeric keys — the same character-indexed shape a string produces, one step
 * less obviously.
 */
function isOptionalBag(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "object" && value !== null && !Array.isArray(value))
  );
}

export function isStateStrict<P extends Params = Params>(
  value: unknown,
): value is RestorableEntry<P> {
  // Basic structure check
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // ⚑ EVERY read below is a call into code this plugin does not own (#1837).
  // The subject is `history.state`: a previous page, another script, or an
  // entry written by an older version of the app can put an accessor on it, or
  // hand over a `get`-trapping Proxy. `isParams` has wrapped its own walk since
  // #1052 for this reason; the guard's own five reads had no boundary.
  //
  // ⚠ Including `params` — the issue that reported this said `isParams` covered
  // it. Measured: it cannot. The getter fires on the property READ inside
  // `isRequiredFields`, before `isParams` is entered, so all five escaped alike.
  //
  // A payload the guard cannot READ is not restorable, so the verdict is the
  // same `false` any other malformed entry gets, and `onPopState` takes the
  // `matchPath` fallback instead of logging a critical error about someone
  // else's accessor.
  try {
    // ⚠ `isRequiredFields` is a TWIN of validation-plugin's copy, locked in
    // step by `scripts/twin-lockstep.test.mjs` — the extra members are checked
    // HERE, outside it, so the pair stays byte-identical and neither this fix
    // nor #1838's needs a change on the other side.
    if (!isRequiredFields(obj)) {
      return false;
    }

    // ⚑ `search` is screened by VALUE, with the same validator the path channel
    // uses (#1837). #1838 closed the SHAPE half here — a string or an array
    // `search` reaches `makeState` as a bag of numeric keys — and stopped there,
    // so a function, a Symbol, a BigInt, a cycle or a class instance rode into
    // the frozen `state.search` while the IDENTICAL value in `params` was
    // refused. Two channels of one entry, opposite treatment, and this is the
    // only one of the two fed by a third party.
    //
    // ⚠ `isParams` SUBSUMES `isOptionalBag` for this member — it refuses
    // non-objects, arrays and custom prototypes before it looks at any value — so
    // the two are not composed, and the shape half is not lost. Pinned by the
    // CONTROL cell in `state-guard-value-domain-1837.test.ts`.
    //
    // ⚠ And it is not a narrowing of the query domain, which was the risk worth
    // measuring: a repeated query key parses to an ARRAY and a bare `?flag` to
    // `null`, and `isParams` accepts both. Measured through the matcher,
    // `/list?a=1&a=2&tab=x&flag` yields `{"a":[1,2],"tab":"x","flag":null}` and
    // survives unchanged.
    //
    // `transition` / `context` keep the shape-only check: neither is restored
    // into a channel — `popstate-utils` hands `makeState` four members and these
    // are not among them.
    return (
      (obj.search === undefined || isParams(obj.search)) &&
      isOptionalBag(obj.transition) &&
      isOptionalBag(obj.context)
    );
  } catch {
    return false;
  }
}
