// packages/real-router/modules/core/dependencies.ts

import { logger } from "logger";

import { getTypeDescription } from "../helpers";

import type { DefaultDependencies, Router } from "core-types";

function validateStringKey(
  methodName: string,
  key: unknown,
): asserts key is string {
  if (typeof key !== "string") {
    throw new TypeError(
      `[router.${methodName}]: dependency name must be a string, got ${typeof key}`,
    );
  }
}

const DEPENDENCY_LIMITS = {
  WARN: 20,
  ERROR: 50,
  HARD_LIMIT: 100,
} as const;

function checkDependencyCount(deps: object, methodName: string): void {
  const currentCount = Object.keys(deps).length;

  if (currentCount === DEPENDENCY_LIMITS.WARN) {
    logger.warn(
      `router.${methodName}`,
      `${DEPENDENCY_LIMITS.WARN} dependencies registered. ` +
        `Consider if all are necessary.`,
    );
  } else if (currentCount === DEPENDENCY_LIMITS.ERROR) {
    logger.error(
      `router.${methodName}`,
      `${DEPENDENCY_LIMITS.ERROR} dependencies registered! ` +
        `This indicates architectural problems. ` +
        `Hard limit at ${DEPENDENCY_LIMITS.HARD_LIMIT}.`,
    );
  } else if (currentCount >= DEPENDENCY_LIMITS.HARD_LIMIT) {
    throw new Error(
      `[router.${methodName}] Dependency limit exceeded (${DEPENDENCY_LIMITS.HARD_LIMIT}). ` +
        `Current: ${currentCount}. This is likely a bug in your code. ` +
        `If you genuinely need more dependencies, your architecture needs refactoring.`,
    );
  }
}

export function withDependencies<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(dependencies: Partial<Dependencies>) {
  const dependencyNotFoundError = (method: string, name: keyof Dependencies) =>
    new ReferenceError(
      `[router.${method}]: dependency "${String(name)}" not found`,
    );

  const setDependencies = (deps: Partial<Dependencies>) => {
    // Reject non-plain objects (classes, Date, Map, Array)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!(deps && typeof deps === "object" && deps.constructor === Object)) {
      throw new TypeError(
        `[router.setDependencies] Invalid argument: expected plain object, received ${getTypeDescription(
          deps,
        )}`,
      );
    }

    // Getters can throw, return different values, or have side effects
    for (const dependencyName in deps) {
      if (Object.getOwnPropertyDescriptor(deps, dependencyName)?.get) {
        throw new TypeError(
          `[router.setDependencies] Getters not allowed: "${dependencyName}"`,
        );
      }
    }

    // Atomic limit check - either all set or none
    checkDependencyCount(
      {
        ...routerDependencies,
        ...deps,
      },
      "setDependencies",
    );

    const overwrittenKeys = [];

    for (const key in deps) {
      if (deps[key] !== undefined) {
        if (Object.hasOwn(routerDependencies, key)) {
          overwrittenKeys.push(key);
        }

        routerDependencies[key] = deps[key];
      }
    }

    if (overwrittenKeys.length > 0) {
      logger.warn(
        "router.setDependencies",
        "Overwritten:",
        overwrittenKeys.join(", "),
      );
    }
  };

  // Create null-prototype object to avoid prototype pollution

  const routerDependencies: Partial<Dependencies> = Object.create(
    null,
  ) as Partial<Dependencies>;

  setDependencies(dependencies);

  return (router: Router<Dependencies>): Router<Dependencies> => {
    router.setDependency = <K extends keyof Dependencies & string>(
      dependencyName: K,
      dependencyValue: Dependencies[K],
    ): Router<Dependencies> => {
      // undefined = "don't set" (feature for conditional setting)
      if (dependencyValue === undefined) {
        return router;
      }

      validateStringKey("setDependency", dependencyName);

      const isNewKey = !Object.hasOwn(routerDependencies, dependencyName);

      if (isNewKey) {
        // Only check limit when adding new keys (overwrites don't increase count)
        checkDependencyCount(routerDependencies, "setDependency");
      } else {
        const oldValue = routerDependencies[dependencyName];
        const isChanging = oldValue !== dependencyValue;
        // Special case for NaN idempotency (NaN !== NaN is always true)
        const bothAreNaN =
          Number.isNaN(oldValue) && Number.isNaN(dependencyValue);

        if (isChanging && !bothAreNaN) {
          logger.warn(
            "router.setDependency",
            "Router dependency already exists and is being overwritten:",
            dependencyName,
          );
        }
      }

      routerDependencies[dependencyName] = dependencyValue;

      return router;
    };

    router.setDependencies = (
      deps: Partial<Dependencies>,
    ): Router<Dependencies> => {
      setDependencies(deps);

      return router;
    };

    router.getDependency = <K extends keyof Dependencies>(
      dependencyName: K,
    ): Dependencies[K] => {
      validateStringKey("getDependency", dependencyName);

      const dependency = routerDependencies[dependencyName];

      if (dependency === undefined) {
        throw dependencyNotFoundError("getDependency", dependencyName);
      }

      return dependency;
    };

    router.getDependencies = (): Partial<Dependencies> => ({
      ...routerDependencies,
    });

    router.removeDependency = (
      dependencyName: keyof Dependencies,
    ): Router<Dependencies> => {
      if (!Object.hasOwn(routerDependencies, dependencyName)) {
        logger.warn(
          `router.removeDependency`,
          `Attempted to remove non-existent dependency: "${getTypeDescription(dependencyName)}"`,
        );
      }

      delete routerDependencies[dependencyName];

      return router;
    };

    router.hasDependency = (dependencyName: keyof Dependencies): boolean => {
      return Object.hasOwn(routerDependencies, dependencyName);
    };

    router.resetDependencies = (): Router<Dependencies> => {
      for (const key in routerDependencies) {
        delete routerDependencies[key];
      }

      return router;
    };

    return router;
  };
}
