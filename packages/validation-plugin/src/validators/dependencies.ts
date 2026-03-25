// packages/validation-plugin/src/validators/dependencies.ts

import { getTypeDescription } from "type-guards";

const DEFAULT_MAX_DEPENDENCIES = 100;

export function validateDependencyName(
  name: unknown,
  methodName: string,
): asserts name is string {
  if (typeof name !== "string") {
    throw new TypeError(
      `[router.${methodName}]: dependency name must be a string, got ${typeof name}`,
    );
  }
}

export function validateSetDependencyArgs(
  name: unknown,
): asserts name is string {
  if (typeof name !== "string") {
    throw new TypeError(
      `[router.setDependency]: dependency name must be a string, got ${typeof name}`,
    );
  }
}

export function validateDependenciesObject(
  deps: unknown,
  methodName: string,
): asserts deps is Record<string, unknown> {
  if (!(deps && typeof deps === "object" && deps.constructor === Object)) {
    throw new TypeError(
      `[router.${methodName}] Invalid argument: expected plain object, received ${getTypeDescription(deps)}`,
    );
  }

  for (const key in deps) {
    if (Object.getOwnPropertyDescriptor(deps, key)?.get) {
      throw new TypeError(
        `[router.${methodName}] Getters not allowed: "${key}"`,
      );
    }
  }
}

export function validateDependencyExists(
  value: unknown,
  dependencyName: string,
): asserts value is NonNullable<unknown> {
  /* v8 ignore next 3 -- @preserve: covered by plugin-lifecycle.test.ts validateDependencyExists test */
  if (value === undefined) {
    throw new ReferenceError(
      `[router.getDependency]: dependency "${dependencyName}" not found`,
    );
  }
}

export function validateDependencyLimit(
  currentCount: number,
  newCount: number,
  methodName: string,
  maxDependencies: number = DEFAULT_MAX_DEPENDENCIES,
): void {
  if (maxDependencies === 0) {
    return;
  }

  const totalCount = currentCount + newCount;

  if (totalCount >= maxDependencies) {
    throw new Error(
      `[router.${methodName}] Dependency limit exceeded (${maxDependencies}). ` +
        `Current: ${totalCount}. This is likely a bug in your code.`,
    );
  }
}
