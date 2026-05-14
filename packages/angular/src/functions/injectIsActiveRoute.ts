import { assertInInjectionContext } from "@angular/core";
import { createActiveRouteSource } from "@real-router/sources";

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
  const strict = options?.strict ?? false;
  const ignoreQueryParams = options?.ignoreQueryParams ?? true;
  const hash = options?.hash;
  // exactOptionalPropertyTypes forbids `{ hash: undefined }` literally — pass
  // the field only when a value was provided. (#532)
  const source = createActiveRouteSource(
    router,
    routeName,
    params,
    hash === undefined
      ? { strict, ignoreQueryParams }
      : { strict, ignoreQueryParams, hash },
  );

  return sourceToSignal(source);
}
