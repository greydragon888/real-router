import { throwIfDisposed } from "./helpers";
import { getInternals } from "../internals";

import type { DependenciesApi } from "./types";
import type { DependenciesStore } from "../namespaces";
import type { RouterValidator } from "../types/RouterValidator";
import type { DefaultDependencies, Router } from "@real-router/types";

// =============================================================================
// Module-private CRUD functions
// =============================================================================

function setDependency(
  store: DependenciesStore,
  dependencyName: string,
  dependencyValue: unknown,
  validator?: RouterValidator | null,
): boolean {
  // undefined = "don't set" (feature for conditional setting)
  if (dependencyValue === undefined) {
    return false;
  }

  const isNewKey = !Object.hasOwn(store.dependencies, dependencyName);

  if (isNewKey) {
    // Only check limit when adding new keys (overwrites don't increase count)
    validator?.dependencies.validateDependencyCount(store, "setDependency");
  } else {
    const oldValue = (store.dependencies as Record<string, unknown>)[
      dependencyName
    ];
    const isChanging = oldValue !== dependencyValue;
    // Special case for NaN idempotency (NaN !== NaN is always true)
    const bothAreNaN = Number.isNaN(oldValue) && Number.isNaN(dependencyValue);

    if (isChanging && !bothAreNaN) {
      validator?.dependencies.warnOverwrite(dependencyName, "setDependency");
    }
  }

  (store.dependencies as Record<string, unknown>)[dependencyName] =
    dependencyValue;

  return true;
}

function setMultipleDependencies(
  store: DependenciesStore,
  deps: Record<string, unknown>,
  validator?: RouterValidator | null,
): void {
  const overwrittenKeys: string[] = [];

  for (const key in deps) {
    if (deps[key] !== undefined) {
      if (Object.hasOwn(store.dependencies, key)) {
        overwrittenKeys.push(key);
      } else {
        validator?.dependencies.validateDependencyCount(
          store,
          "setDependencies",
        );
      }

      (store.dependencies as Record<string, unknown>)[key] = deps[key];
    }
  }

  if (overwrittenKeys.length > 0) {
    validator?.dependencies.warnBatchOverwrite(
      overwrittenKeys,
      "setDependencies",
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

      setDependency(
        ctx.dependenciesGetStore(),
        name as string,
        value,
        ctx.validator,
      );
    },
    setAll: (deps) => {
      throwIfDisposed(ctx.isDisposed);

      const store = ctx.dependenciesGetStore();

      ctx.validator?.dependencies.validateDependenciesObject(
        deps,
        "setDependencies",
      );
      ctx.validator?.dependencies.validateDependencyLimit(store, store.limits);

      setMultipleDependencies(
        store,
        deps as Record<string, unknown>,
        ctx.validator,
      );
    },
    remove: (name) => {
      throwIfDisposed(ctx.isDisposed);

      ctx.validator?.dependencies.validateDependencyName(
        name,
        "removeDependency",
      );

      const store = ctx.dependenciesGetStore();

      if (!Object.hasOwn(store.dependencies, name as string)) {
        ctx.validator?.dependencies.warnRemoveNonExistent(name);
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
