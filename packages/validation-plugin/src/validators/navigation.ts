// packages/validation-plugin/src/validators/navigation.ts

import {
  getTypeDescription,
  isNavigationOptions,
  isParams,
  isString,
} from "type-guards";

import type { NavigationOptions } from "@real-router/core";

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

export function validateNavigateParams(
  params: unknown,
  methodName: string,
): void {
  if (params !== undefined && !isParams(params)) {
    throw new TypeError(
      `[router.${methodName}] params must be a plain object, got ${getTypeDescription(params)}`,
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
  if (typeof path === "string" && path !== "" && !path.startsWith("/")) {
    throw new TypeError(
      `[router.start] path must start with "/", got "${path}".`,
    );
  }
}
