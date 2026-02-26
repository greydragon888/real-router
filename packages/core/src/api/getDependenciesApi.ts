import { errorCodes } from "../constants";
import { getInternals } from "../internals";
import {
  validateDependenciesObject,
  validateDependencyExists,
  validateDependencyLimit,
  validateDependencyName,
  validateSetDependencyArgs,
} from "../namespaces/DependenciesNamespace/validators";
import { RouterError } from "../RouterError";

import type { Router } from "../Router";
import type { DependenciesApi } from "./types";
import type { DefaultDependencies } from "@real-router/types";

function throwIfDisposed(isDisposed: () => boolean): void {
  if (isDisposed()) {
    throw new RouterError(errorCodes.ROUTER_DISPOSED);
  }
}

export function getDependenciesApi<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(router: Router<Dependencies>): DependenciesApi<Dependencies> {
  const ctx = getInternals(router);

  return {
    get: (name) => {
      if (!ctx.noValidate) {
        validateDependencyName(name, "getDependency");
      }

      const value = ctx.dependencyGet(name as string);

      if (!ctx.noValidate) {
        validateDependencyExists(value, name as string);
      }

      return value as Dependencies[typeof name];
    },
    getAll: () => ctx.dependencyGetAll() as Partial<Dependencies>,
    set: (name, value) => {
      throwIfDisposed(ctx.isDisposed);

      if (!ctx.noValidate) {
        validateSetDependencyArgs(name);
      }

      ctx.dependencySet(name, value);
    },
    setAll: (deps) => {
      throwIfDisposed(ctx.isDisposed);

      if (!ctx.noValidate) {
        validateDependenciesObject(deps, "setDependencies");
        validateDependencyLimit(
          ctx.dependencyCount(),
          Object.keys(deps).length,
          "setDependencies",
          ctx.maxDependencies,
        );
      }

      ctx.dependencySetMultiple(deps as Record<string, unknown>);
    },
    remove: (name) => {
      throwIfDisposed(ctx.isDisposed);

      if (!ctx.noValidate) {
        validateDependencyName(name, "removeDependency");
      }

      ctx.dependencyRemove(name as string);
    },
    reset: () => {
      throwIfDisposed(ctx.isDisposed);
      ctx.dependencyReset();
    },
    has: (name) => {
      if (!ctx.noValidate) {
        validateDependencyName(name, "hasDependency");
      }

      return ctx.dependencyHas(name as string);
    },
  };
}
