import { createActiveRouteSource } from "@real-router/sources";

import { sourceToSignal } from "../sourceToSignal";
import { injectRouter } from "./injectRouter";

import type { Signal } from "@angular/core";
import type { Params } from "@real-router/core";

export function injectIsActiveRoute(
  routeName: string,
  params?: Params,
  options?: { strict?: boolean; ignoreQueryParams?: boolean },
): Signal<boolean> {
  const router = injectRouter();
  const source = createActiveRouteSource(router, routeName, params, {
    strict: options?.strict ?? false,
    ignoreQueryParams: options?.ignoreQueryParams ?? true,
  });

  return sourceToSignal(source);
}
