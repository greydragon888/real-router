// packages/validation-plugin/src/validators/dependencies.ts

import { computeThresholds } from "../helpers";
import { getTypeDescription } from "../type-guards";

import type { RouterLogger } from "@real-router/core";

const DEFAULT_MAX_DEPENDENCIES = 100;

/**
 * Captured at module load, mirroring `core/src/guards.ts`. A validator is only
 * as strong as the intrinsic it reads WHEN IT RUNS.
 */
const objectKeys = Object.keys;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const getPrototypeOf = Object.getPrototypeOf;
const ObjectCtor = Object;

/**
 * ⚑ The MIRROR of `ingestDependencies` (core `guards.ts` — renamed from
 * `guardDependencies` when it absorbed the copy walk, #1860/#1861), and it has to
 * stay one.
 *
 * This plugin's whole contract is `plugin ⊇ core`: it may diagnose more, never
 * refuse what core accepts. Core moved this predicate from `deps.constructor` to
 * the PROTOTYPE's `constructor` (#1858) and began admitting a null prototype;
 * while these two copies still read the instance, an application running the
 * plugin got a false reject on exactly the shapes core had just widened —
 * `setDependencies` and `cloneRouter`'s override bag both threw on a bag
 * carrying a `constructor` key, which is the #1858 defect on a different door.
 *
 * ⚠ The walk is `objectKeys`, not `for…in`, for the same reason core's is
 * (#1799): `for…in` visits inherited names that `getOwnPropertyDescriptor`
 * answers `undefined` for, so the loop iterated exactly the names it could not
 * judge — and on a Proxy the two disagree about ownership outright.
 */
function isPlainBag(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const proto = getPrototypeOf(value) as { constructor?: unknown } | null;

  return proto === null || proto.constructor === ObjectCtor;
}

export function validateDependencyName(
  name: unknown,
  methodName: string,
): asserts name is string {
  if (typeof name !== "string") {
    throw new TypeError(
      `[router.${methodName}] dependency name must be a string, got ${typeof name}`,
    );
  }
}

export function validateSetDependencyArgs(
  name: unknown,
): asserts name is string {
  if (typeof name !== "string") {
    throw new TypeError(
      `[router.setDependency] dependency name must be a string, got ${typeof name}`,
    );
  }
}

export function validateDependenciesObject(
  deps: unknown,
  methodName: string,
): asserts deps is Record<string, unknown> {
  if (!isPlainBag(deps)) {
    throw new TypeError(
      `[router.${methodName}] Invalid argument: expected plain object, received ${getTypeDescription(deps)}`,
    );
  }

  for (const key of objectKeys(deps)) {
    if (getOwnPropertyDescriptor(deps, key)?.get) {
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
      `[router.getDependency] dependency "${dependencyName}" not found`,
    );
  }
}

export function validateDependencyCount(
  store: unknown,
  methodName: string,
  logger: RouterLogger,
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

  const currentCount = objectKeys(typedStore.dependencies).length;
  const { warn, error } = computeThresholds(maxDependencies);

  if (currentCount >= maxDependencies) {
    throw new RangeError(
      `[router.${methodName}] Dependency limit exceeded (${maxDependencies}). Current: ${currentCount}.`,
    );
  }
  if (currentCount === error) {
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

  if (!isPlainBag(dependencies)) {
    throw new TypeError(
      `[cloneRouter] Invalid dependencies: expected plain object or undefined, received ${typeof dependencies}`,
    );
  }

  for (const key of objectKeys(dependencies)) {
    if (getOwnPropertyDescriptor(dependencies, key)?.get) {
      throw new TypeError(
        `[cloneRouter] Getters not allowed in dependencies: "${key}"`,
      );
    }
  }
}

export function warnOverwrite(
  name: string,
  methodName: string,
  logger: RouterLogger,
): void {
  logger.warn(
    `router.${methodName}`,
    "Router dependency already exists and is being overwritten:",
    name,
  );
}

export function warnBatchOverwrite(
  keys: string[],
  methodName: string,
  logger: RouterLogger,
): void {
  logger.warn(`router.${methodName}`, "Overwritten:", keys.join(", "));
}

export function warnRemoveNonExistent(
  name: unknown,
  logger: RouterLogger,
): void {
  logger.warn(
    "router.removeDependency",
    `Attempted to remove non-existent dependency: "${typeof name === "string" ? name : String(name)}"`,
  );
}
