import { assertInInjectionContext } from "@angular/core";
import { createActiveSource } from "@real-router/sources";

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
  // Route through the shared fast/slow builder (mirrors RealLink / RealLinkActive):
  // a default-options call (non-empty name, no params, non-strict, query-ignoring, no
  // hash) shares the per-router createActiveNameSelector fast path instead of a
  // dedicated createActiveRouteSource + subscription (#1437). Behavior-identical —
  // createActiveRouteSource normalizes the options internally either way.
  const source = createActiveSource(
    router,
    routeName,
    params,
    // Query channel (RFC-4 M2, #1548) — no `routeSearch` on this function yet;
    // `[realLink routeSearch]` wires a real value through in a follow-up.
    undefined,
    options?.strict ?? false,
    options?.ignoreQueryParams ?? true,
    options?.hash,
  );

  return sourceToSignal(source);
}
