// packages/core/src/guards.ts

import type { Route } from "./types";

function isAsyncFunction(fn: unknown): boolean {
  return (
    (fn as { constructor: { name: string } }).constructor.name ===
    "AsyncFunction"
  );
}

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

export function guardRouteCallbacks(route: Route): void {
  if (
    route.canActivate !== undefined &&
    typeof route.canActivate !== "function"
  ) {
    throw new TypeError("canActivate must be a function");
  }
  if (
    route.canDeactivate !== undefined &&
    typeof route.canDeactivate !== "function"
  ) {
    throw new TypeError("canDeactivate must be a function");
  }
}

export function guardNoAsyncCallbacks(route: Route): void {
  if (route.decodeParams !== undefined && isAsyncFunction(route.decodeParams)) {
    throw new TypeError("decodeParams cannot be async");
  }
  if (route.encodeParams !== undefined && isAsyncFunction(route.encodeParams)) {
    throw new TypeError("encodeParams cannot be async");
  }
  if (
    typeof route.forwardTo === "function" &&
    isAsyncFunction(route.forwardTo)
  ) {
    throw new TypeError("forwardTo callback cannot be async");
  }
}

export function guardRouteStructure(routes: Route[]): void {
  for (const route of routes) {
    const r: unknown = route;
    if (r === null || typeof r !== "object" || Array.isArray(r)) {
      throw new TypeError("route must be a non-array object");
    }
    guardRouteCallbacks(route);
    guardNoAsyncCallbacks(route);
    if (route.children) {
      guardRouteStructure(route.children);
    }
  }
}
