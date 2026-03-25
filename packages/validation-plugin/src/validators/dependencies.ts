// packages/validation-plugin/src/validators/dependencies.ts

import { logger } from "@real-router/logger";
import { getTypeDescription } from "type-guards";

import { computeThresholds } from "../helpers";

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

export function validateDependencyCount(
  store: unknown,
  methodName: string,
): void {
  const typedStore = store as {
    dependencies: Record<string, unknown>;
    limits?: { maxDependencies?: number };
  };
  const maxDependencies =
    typedStore.limits?.maxDependencies ?? DEFAULT_MAX_DEPENDENCIES;

  if (maxDependencies === 0) {
    return;
  }

  const currentCount = Object.keys(typedStore.dependencies).length;
  const { warn, error } = computeThresholds(maxDependencies);

  if (currentCount >= maxDependencies) {
    throw new Error(
      `[router.${methodName}] Dependency limit exceeded (${maxDependencies}). Current: ${currentCount}.`,
    );
  } else if (currentCount === error) {
    logger.error(
      `router.${methodName}`,
      `${currentCount} dependencies registered! This indicates architectural problems. Hard limit at ${maxDependencies}.`,
    );
  } else if (currentCount === warn) {
    logger.warn(
      `router.${methodName}`,
      `${currentCount} dependencies registered. Consider if all are necessary.`,
    );
  }
}

export function validateCloneArgs(dependencies: unknown): void {
  if (dependencies === undefined) {
    return;
  }

  if (
    !(
      dependencies &&
      typeof dependencies === "object" &&
      dependencies.constructor === Object
    )
  ) {
    throw new TypeError(
      `[cloneRouter] Invalid dependencies: expected plain object or undefined, received ${typeof dependencies}`,
    );
  }

  for (const key in dependencies as Record<string, unknown>) {
    if (Object.getOwnPropertyDescriptor(dependencies, key)?.get) {
      throw new TypeError(
        `[cloneRouter] Getters not allowed in dependencies: "${key}"`,
      );
    }
  }
}

export function warnOverwrite(name: string, methodName: string): void {
  logger.warn(
    `router.${methodName}`,
    "Router dependency already exists and is being overwritten:",
    name,
  );
}

export function warnBatchOverwrite(keys: string[], methodName: string): void {
  logger.warn(`router.${methodName}`, "Overwritten:", keys.join(", "));
}

export function warnRemoveNonExistent(name: unknown): void {
  logger.warn(
    "router.removeDependency",
    `Attempted to remove non-existent dependency: "${typeof name === "string" ? name : String(name)}"`,
  );
}
