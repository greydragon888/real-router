import type { Router } from "../Router";
import type { DependenciesApi } from "./types";
import type { DefaultDependencies } from "@real-router/types";

export function getDependenciesApi<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(router: Router<Dependencies>): DependenciesApi<Dependencies> {
  return {
    get: router.getDependency,
    getAll: router.getDependencies,
    set: (name, value) => {
      router.setDependency(name, value);
    },
    setAll: (deps) => {
      router.setDependencies(deps);
    },
    remove: (name) => {
      router.removeDependency(name);
    },
    reset: () => {
      router.resetDependencies();
    },
    has: router.hasDependency,
  };
}
