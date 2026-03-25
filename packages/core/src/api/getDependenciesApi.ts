import { logger } from "@real-router/logger";
import { getTypeDescription } from "type-guards";

import { throwIfDisposed } from "./helpers";
import { computeThresholds } from "../helpers";
import { getInternals } from "../internals";

import type { DependenciesApi } from "./types";
import type { DependenciesStore } from "../namespaces";
import type { DefaultDependencies, Router } from "@real-router/types";

// =============================================================================
// Module-private CRUD functions
// =============================================================================

function checkDependencyCount(
  store: DependenciesStore,
  methodName: string,
): void {
  const maxDependencies = store.limits.maxDependencies;

  if (maxDependencies === 0) {
    return;
  }

  const currentCount = Object.keys(store.dependencies).length;

  const { warn, error } = computeThresholds(maxDependencies);

  if (currentCount === warn) {
    logger.warn(
      `router.${methodName}`,
      `${warn} dependencies registered. ` + `Consider if all are necessary.`,
    );
  } else if (currentCount === error) {
    logger.error(
      `router.${methodName}`,
      `${error} dependencies registered! ` +
        `This indicates architectural problems. ` +
        `Hard limit at ${maxDependencies}.`,
    );
  } else if (currentCount >= maxDependencies) {
    throw new Error(
      `[router.${methodName}] Dependency limit exceeded (${maxDependencies}). ` +
        `Current: ${currentCount}. This is likely a bug in your code. ` +
        `If you genuinely need more dependencies, your architecture needs refactoring.`,
    );
  }
}

function setDependency(
  store: DependenciesStore,
  dependencyName: string,
  dependencyValue: unknown,
): boolean {
  // undefined = "don't set" (feature for conditional setting)
  if (dependencyValue === undefined) {
    return false;
  }

  const isNewKey = !Object.hasOwn(store.dependencies, dependencyName);

  if (isNewKey) {
    // Only check limit when adding new keys (overwrites don't increase count)
    checkDependencyCount(store, "setDependency");
  } else {
    const oldValue = (store.dependencies as Record<string, unknown>)[
      dependencyName
    ];
    const isChanging = oldValue !== dependencyValue;
    // Special case for NaN idempotency (NaN !== NaN is always true)
    const bothAreNaN = Number.isNaN(oldValue) && Number.isNaN(dependencyValue);

    if (isChanging && !bothAreNaN) {
      logger.warn(
        "router.setDependency",
        "Router dependency already exists and is being overwritten:",
        dependencyName,
      );
    }
  }

  (store.dependencies as Record<string, unknown>)[dependencyName] =
    dependencyValue;

  return true;
}

function setMultipleDependencies(
  store: DependenciesStore,
  deps: Record<string, unknown>,
): void {
  const overwrittenKeys: string[] = [];

  for (const key in deps) {
    if (deps[key] !== undefined) {
      if (Object.hasOwn(store.dependencies, key)) {
        overwrittenKeys.push(key);
      } else {
        checkDependencyCount(store, "setDependencies");
      }

      (store.dependencies as Record<string, unknown>)[key] = deps[key];
    }
  }

  if (overwrittenKeys.length > 0) {
    logger.warn(
      "router.setDependencies",
      "Overwritten:",
      overwrittenKeys.join(", "),
    );
  }
}

// =============================================================================
// Public API factory
// =============================================================================

export function getDependenciesApi<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(router: Router<Dependencies>): DependenciesApi<Dependencies> {
  const ctx = getInternals(router);

  return {
    get: (name) => {
      ctx.validator?.dependencies.validateDependencyName(name, "getDependency");

      const store = ctx.dependenciesGetStore();
      const value = (store.dependencies as Record<string, unknown>)[
        name as string
      ];

      ctx.validator?.dependencies.validateDependencyExists(
        name as string,
        store,
      );

      return value as Dependencies[typeof name];
    },
    getAll: () => ({ ...ctx.dependenciesGetStore().dependencies }),
    set: (name, value) => {
      throwIfDisposed(ctx.isDisposed);

      ctx.validator?.dependencies.validateSetDependencyArgs(
        name,
        value,
        "setDependency",
      );

      setDependency(ctx.dependenciesGetStore(), name as string, value);
    },
    setAll: (deps) => {
      throwIfDisposed(ctx.isDisposed);

      const store = ctx.dependenciesGetStore();

      ctx.validator?.dependencies.validateDependenciesObject(
        deps,
        "setDependencies",
      );
      ctx.validator?.dependencies.validateDependencyLimit(store, store.limits);

      setMultipleDependencies(store, deps as Record<string, unknown>);
    },
    remove: (name) => {
      throwIfDisposed(ctx.isDisposed);

      ctx.validator?.dependencies.validateDependencyName(
        name,
        "removeDependency",
      );

      const store = ctx.dependenciesGetStore();

      if (!Object.hasOwn(store.dependencies, name as string)) {
        logger.warn(
          `router.removeDependency`,
          `Attempted to remove non-existent dependency: "${getTypeDescription(name)}"`,
        );
      }

      delete (store.dependencies as Record<string, unknown>)[name as string];
    },
    reset: () => {
      throwIfDisposed(ctx.isDisposed);
      const store = ctx.dependenciesGetStore();

      store.dependencies = Object.create(null) as Partial<Dependencies>;
    },
    has: (name) => {
      ctx.validator?.dependencies.validateDependencyName(name, "hasDependency");

      return Object.hasOwn(
        ctx.dependenciesGetStore().dependencies,
        name as string,
      );
    },
  };
}
