import { assertInInjectionContext } from "@angular/core";
import { createActiveRouteSource } from "@real-router/sources";

import { buildActiveRouteOptions } from "../internal/buildActiveRouteOptions";
import { sourceToSignal } from "../sourceToSignal";
import { injectRouter } from "./injectRouter";

import type { Signal } from "@angular/core";
import type { Params } from "@real-router/core";

export function injectIsActiveRoute(
  routeName: string,
  params?: Params,
  options?: { strict?: boolean; ignoreQueryParams?: boolean; hash?: string },
): Signal<boolean> {
  assertInInjectionContext(injectIsActiveRoute);

  const router = injectRouter();
  const source = createActiveRouteSource(
    router,
    routeName,
    params,
    buildActiveRouteOptions(
      options?.strict ?? false,
      options?.ignoreQueryParams ?? true,
      options?.hash,
    ),
  );

  return sourceToSignal(source);
}
