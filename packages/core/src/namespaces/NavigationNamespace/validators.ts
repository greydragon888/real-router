// packages/core/src/namespaces/NavigationNamespace/validators.ts

/**
 * Static validation functions for NavigationNamespace.
 * Called by Router facade before instance methods.
 */

import { getTypeDescription, isNavigationOptions } from "type-guards";

import type { ParsedNavigateArgs, ParsedNavigateDefaultArgs } from "./types";
import type {
  DoneFn,
  NavigationOptions,
  Params,
  State,
} from "@real-router/types";

const noop = (): void => {};

/**
 * Cached frozen empty objects to reduce GC pressure.
 * Safe because they're frozen and cannot be mutated.
 */
const EMPTY_PARAMS: Params = Object.freeze({});
const EMPTY_OPTS: NavigationOptions = Object.freeze({});

/**
 * Validates navigate route name argument.
 */
export function validateNavigateArgs(name: unknown): asserts name is string {
  if (typeof name !== "string") {
    throw new TypeError(
      `[router.navigate] Invalid route name: expected string, got ${getTypeDescription(name)}`,
    );
  }
}

/**
 * Validates navigateToState arguments.
 */
export function validateNavigateToStateArgs(
  toState: unknown,
  fromState: unknown,
  opts: unknown,
  callback: unknown,
  emitSuccess: unknown,
): void {
  // toState must be a valid state object
  if (
    !toState ||
    typeof toState !== "object" ||
    typeof (toState as State).name !== "string" ||
    typeof (toState as State).path !== "string"
  ) {
    throw new TypeError(
      `[router.navigateToState] Invalid toState: expected State object with name and path`,
    );
  }

  // fromState can be undefined or a valid state
  if (
    fromState !== undefined &&
    (!fromState ||
      typeof fromState !== "object" ||
      typeof (fromState as State).name !== "string")
  ) {
    throw new TypeError(
      `[router.navigateToState] Invalid fromState: expected State object or undefined`,
    );
  }

  // opts must be an object
  if (typeof opts !== "object" || opts === null) {
    throw new TypeError(
      `[router.navigateToState] Invalid opts: expected NavigationOptions object, got ${getTypeDescription(opts)}`,
    );
  }

  // callback must be a function
  if (typeof callback !== "function") {
    throw new TypeError(
      `[router.navigateToState] Invalid callback: expected function, got ${getTypeDescription(callback)}`,
    );
  }

  // emitSuccess must be a boolean
  if (typeof emitSuccess !== "boolean") {
    throw new TypeError(
      `[router.navigateToState] Invalid emitSuccess: expected boolean, got ${getTypeDescription(emitSuccess)}`,
    );
  }
}

/**
 * Validates navigateToDefault arguments (before parsing).
 */
export function validateNavigateToDefaultArgs(
  optsOrDone: unknown,
  done: unknown,
): void {
  // If first arg is provided and not a function, it must be an object (options)
  if (
    optsOrDone !== undefined &&
    typeof optsOrDone !== "function" &&
    (typeof optsOrDone !== "object" || optsOrDone === null)
  ) {
    throw new TypeError(
      `[router.navigateToDefault] Invalid options: ${getTypeDescription(optsOrDone)}. Expected NavigationOptions object or callback function.`,
    );
  }

  // If second arg is provided, it must be a function
  if (done !== undefined && typeof done !== "function") {
    throw new TypeError(
      `[router.navigateToDefault] Invalid callback: expected function, got ${getTypeDescription(done)}`,
    );
  }
}

/**
 * Validates that opts is a valid NavigationOptions object.
 */
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

/**
 * Parses the polymorphic arguments of navigate().
 *
 * Handles all valid call signatures:
 * - navigate(name, callback)
 * - navigate(name, params)
 * - navigate(name, params, callback)
 * - navigate(name, params, opts)
 * - navigate(name, params, opts, callback)
 */
export function parseNavigateArgs(
  paramsOrDone?: Params | DoneFn,
  optsOrDone?: NavigationOptions | DoneFn,
  done?: DoneFn,
): ParsedNavigateArgs {
  if (typeof paramsOrDone === "function") {
    // Form: navigate(name, callback)
    return { params: EMPTY_PARAMS, opts: EMPTY_OPTS, callback: paramsOrDone };
  }

  // Forms: navigate(name), navigate(name, params), navigate(name, params, callback),
  //        navigate(name, params, opts), navigate(name, params, opts, callback)
  // Also handles: navigate(name, null/undefined, callback) - runtime defense
  const params = paramsOrDone ?? EMPTY_PARAMS;

  if (typeof optsOrDone === "function") {
    return { params, opts: EMPTY_OPTS, callback: optsOrDone };
  }

  return {
    params,
    opts: optsOrDone ?? EMPTY_OPTS,
    callback: done ?? noop,
  };
}

/**
 * Parses the polymorphic arguments of navigateToDefault().
 */
export function parseNavigateToDefaultArgs(
  optsOrDone?: NavigationOptions | DoneFn,
  done?: DoneFn,
): ParsedNavigateDefaultArgs {
  if (typeof optsOrDone === "function") {
    return { opts: EMPTY_OPTS, callback: optsOrDone };
  }

  return {
    opts: optsOrDone ?? EMPTY_OPTS,
    callback: done ?? noop,
  };
}
