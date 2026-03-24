// packages/validation-plugin/src/validators/navigation.ts

import { getTypeDescription, isNavigationOptions } from "type-guards";

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
