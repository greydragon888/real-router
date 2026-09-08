// packages/validation-plugin/src/validators/navigation.ts

import {
  getTypeDescription,
  isNavigationOptions,
  isParams,
  isString,
} from "../type-guards";

import type { NavigationOptions } from "@real-router/core";

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — each answers "what is on this object" for a value this module
 * did not build, so read off the live global they are the weakest point of every
 * check built on them. `guards.ts` states the doctrine and its measurement: one
 * naive `Object.hasOwn` polyfill walked straight through five sibling readers
 * while the single captured guard held.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it — a shim evaluated ahead of core still wins
 * (#1798), which is the doctrine's own caveat and travels with it.
 */
const hasOwn = Object.hasOwn;
const getPrototypeOf = Object.getPrototypeOf;

export function validateNavigateArgs(name: unknown): asserts name is string {
  if (typeof name !== "string") {
    throw new TypeError(
      `[router.navigate] Invalid route name: expected string, got ${getTypeDescription(name)}`,
    );
  }
}

export function validateNavigateToDefaultArgs(opts: unknown): void {
  if (opts !== undefined && (typeof opts !== "object" || opts === null)) {
    throw new TypeError(
      `[router.navigateToDefault] Invalid options: ${getTypeDescription(opts)}. Expected NavigationOptions object.`,
    );
  }
}

export function validateNavigateToStateArgs(state: unknown): void {
  if (typeof state !== "object" || state === null) {
    throw new TypeError(
      `[router.navigateToState] Invalid state: ${getTypeDescription(state)}. Expected State object.`,
    );
  }

  const candidate = state as { name: unknown; params: unknown; path: unknown };

  if (!isString(candidate.name)) {
    throw new TypeError(
      `[router.navigateToState] Invalid state.name: ${getTypeDescription(candidate.name)}. Expected string.`,
    );
  }
  if (!isParams(candidate.params)) {
    throw new TypeError(
      `[router.navigateToState] Invalid state.params: ${getTypeDescription(candidate.params)}. Expected plain object.`,
    );
  }
  if (!isString(candidate.path)) {
    throw new TypeError(
      `[router.navigateToState] Invalid state.path: ${getTypeDescription(candidate.path)}. Expected string.`,
    );
  }
}

export function validateNavigationOptions(
  opts: unknown,
  methodName: string,
): asserts opts is NavigationOptions {
  if (!isNavigationOptions(opts)) {
    throw new TypeError(
      `[router.${methodName}] Invalid options: ${getTypeDescription(opts)}. Expected NavigationOptions object.`,
    );
  }
}

// C0 control chars (U+0000–U+001F) and DEL (U+007F). Core percent-encodes them
// into the URL path (%00, %01, …) instead of failing, admitting unreadable,
// non-copyable paths into committed state (#942).
// eslint-disable-next-line no-control-regex -- matching control characters IS the validation here (#942)
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;

/**
 * Rejects param VALUES that cannot safely round-trip through a URL path:
 * - `symbol` / `bigint` stringify lossily — a Symbol keeps its raw identity in
 *   `state.params` and never matches back from the path, so navigation
 *   "succeeds" with a corrupt, non-round-tripping path (#934);
 * - a `string` carrying control characters corrupts the path segment (#942).
 *
 * Pinpoints the offending key so the message is actionable, instead of the
 * generic "params must be a plain object" shape error.
 */
function assertValidParamValues(
  params: Record<string, unknown>,
  methodName: string,
): void {
  for (const key in params) {
    if (!hasOwn(params, key)) {
      continue;
    }

    const value = params[key];
    const valueType = typeof value;

    if (valueType === "symbol" || valueType === "bigint") {
      throw new TypeError(
        `[router.${methodName}] param "${key}" cannot be a ${valueType} — it does not round-trip through the URL path. Use a string, number, or boolean.`,
      );
    }

    if (valueType === "string" && CONTROL_CHARS_RE.test(value as string)) {
      throw new TypeError(
        `[router.${methodName}] param "${key}" must not contain control characters (NUL / C0 / DEL) — they corrupt the URL path.`,
      );
    }
  }
}

/**
 * The path bag's SHAPE, judged on the object the CALLER still owns (#2134).
 *
 * ⚑ **Split from `validateNavigateParams` because the two halves belong to two
 * different objects.** The shape has to be judged before core copies, because a
 * copy of anything is a plain object: core's copy is a spread, so `"abc"` arrives
 * as `{0:"a",1:"b",2:"c"}` and a class instance arrives without its prototype.
 * Judged after the copy, every shape this function exists to refuse would be
 * LAUNDERED into an acceptable one.
 *
 * ⚑ **The values belong to the copy, and that is the defect this split closes.**
 * Judged on the caller's bag, they are a different read from the one core ships —
 * a key answering `v1` then `v2` is admitted on one and printed on the other, and
 * `judged-equals-shipped-2134` holds every door to the bare-core answer.
 *
 * ⚠ **Reads no value, and that is a contract rather than an optimisation.**
 * Every read of a caller-owned bag is a call into application code. This half
 * runs before core has read anything, so it must not run the application's
 * getters — `validateNavigateParams` walks the values afterwards, on core's own
 * copy, where a read is a read of data.
 */
export function validateNavigateParamsShape(
  params: unknown,
  methodName: string,
): void {
  if (params === undefined) {
    return;
  }

  // ⚠ `null` first, because it is the one shape that cannot be ASKED for a
  // prototype: `Object.getPrototypeOf(null)` raises a bare `TypeError` naming
  // neither the door nor the argument.
  //
  // ⚑ Then the prototype, and it is the WHOLE test — a separate `typeof` or
  // `Array.isArray` term would be unreachable, because everything they refuse
  // the prototype refuses too: a string answers `String.prototype`, an array
  // `Array.prototype`, a class instance its class. `isParamsUnsafe` spells all
  // four because its fast path then walks the value with `for…in`, where an
  // array's indices matter; this half walks nothing.
  const proto =
    params === null ? false : (getPrototypeOf(params) as object | null);

  if (proto !== null && proto !== Object.prototype) {
    throw new TypeError(
      `[router.${methodName}] params must be a plain object, got ${getTypeDescription(params)}`,
    );
  }
}

/**
 * The path bag's VALUES, judged on the object CORE will ship (#2134).
 *
 * ⚑ **The argument is core's own copy, not the caller's bag**, and that is the
 * whole point of the split: `validateNavigateParamsShape` has already refused
 * every shape a copy would launder, and core has read the caller's object
 * exactly once to build this one. A key that answers differently per read is
 * therefore admitted on the same value the URL prints.
 *
 * ⚠ **No shape branch here, and its absence is load bearing rather than an
 * omission.** Every caller passes `undefined` or core's own copy of the bag,
 * so a `typeof` guard would be an unreachable arm — the shape half runs one
 * call earlier, on the object that can still be the wrong shape. `isParams`
 * below still re-applies the shape rules to the copy, so a caller that
 * bypassed the pair is refused rather than admitted.
 */
export function validateNavigateParams(
  params: unknown,
  methodName: string,
): void {
  if (params === undefined) {
    return;
  }

  // Inspect individual values first so a Symbol/BigInt/control-char value gets a
  // precise, value-specific message instead of the generic error below.
  assertValidParamValues(params as Record<string, unknown>, methodName);

  if (!isParams(params)) {
    throw new TypeError(
      `[router.${methodName}] params must be a plain object, got ${getTypeDescription(params)}`,
    );
  }
}

/**
 * The QUERY channel's shape, the twin `validateParams` never had (#1972).
 *
 * ⚑ Shape only, and deliberately not the value inspection its path twin runs:
 * a query value is printed with `String()` and round-trips through the URL, so
 * the Symbol/BigInt/control-char rules that make a PATH segment unrepresentable
 * do not transfer. What was missing is that nothing asked whether the bag was a
 * bag at all — a string spread character by character into `state.search`.
 */
export function validateSearch(search: unknown, methodName: string): void {
  if (search === undefined) {
    return;
  }

  if (typeof search !== "object" || search === null || Array.isArray(search)) {
    throw new TypeError(
      `[router.${methodName}] search must be a plain object, got ${getTypeDescription(search)}`,
    );
  }
}

export function validateStartArgs(path: unknown): void {
  // undefined is allowed — browser-plugin injects path via interceptor AFTER facade validation
  if (path !== undefined && typeof path !== "string") {
    throw new TypeError(
      `[router.start] path must be a string, got ${getTypeDescription(path)}.`,
    );
  }
  if (typeof path === "string") {
    // #942: a NUL byte / control char would be silently percent-encoded into
    // state.path (%00, %01) by core — reject it with an actionable error.
    if (CONTROL_CHARS_RE.test(path)) {
      throw new TypeError(
        `[router.start] path must not contain control characters (NUL / C0 / DEL).`,
      );
    }
    if (path !== "" && !path.startsWith("/")) {
      throw new TypeError(
        `[router.start] path must start with "/", got "${path}".`,
      );
    }
  }
}
