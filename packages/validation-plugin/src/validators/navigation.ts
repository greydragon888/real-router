// packages/validation-plugin/src/validators/navigation.ts

import { getTypeDescription, isNavigationOptions, isParams } from "type-guards";

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
