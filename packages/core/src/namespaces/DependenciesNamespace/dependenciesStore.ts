import { DEFAULT_LIMITS } from "../../constants";

import type { Limits } from "../../types";
import type { DefaultDependencies } from "@real-router/types";

export interface DependenciesStore<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  dependencies: Partial<Dependencies>;
  limits: Limits;
}

export function createDependenciesStore<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  initialDependencies: Partial<Dependencies> = {} as Dependencies,
): DependenciesStore<Dependencies> {
  const dependencies = Object.create(null) as Partial<Dependencies>;

  for (const key in initialDependencies) {
    if (initialDependencies[key] !== undefined) {
      dependencies[key] = initialDependencies[key];
    }
  }

  return {
    dependencies,
    limits: DEFAULT_LIMITS,
  };
}
