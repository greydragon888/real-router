// packages/core/src/guards.ts

import type { Route } from "./types";
import type { RouterValidator } from "./types/RouterValidator";

export function guardDependencies(deps: unknown): void {
  if (
    !deps ||
    typeof deps !== "object" ||
    (deps as { constructor: unknown }).constructor !== Object
  ) {
    throw new TypeError("dependencies must be a plain object");
  }
  for (const key in deps as Record<string, unknown>) {
    if (Object.getOwnPropertyDescriptor(deps, key)?.get) {
      throw new TypeError(`dependencies cannot contain getters: "${key}"`);
    }
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any -- accepts any Route type */
export function guardRouteStructure(
  routes: Route<any>[],
  validator?: RouterValidator | null,
): void {
  /* eslint-enable @typescript-eslint/no-explicit-any */
  for (const route of routes) {
    const routeValue: unknown = route;

    if (
      routeValue === null ||
      typeof routeValue !== "object" ||
      Array.isArray(routeValue)
    ) {
      throw new TypeError("route must be a non-array object");
    }

    validator?.routes.guardRouteCallbacks(route as Route);
    validator?.routes.guardNoAsyncCallbacks(route as Route);
    const children = (route as Route).children;

    if (children) {
      guardRouteStructure(children, validator);
    }
  }
}
