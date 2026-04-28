import { injectOrThrow } from "./injectOrThrow";
import { ROUTE } from "../providers";

import type { RouteSignals } from "../types";
import type { Signal } from "@angular/core";
import type { Params, State } from "@real-router/core";
import type { RouteSnapshot } from "@real-router/sources";

export function injectRoute<P extends Params = Params>(): Omit<
  RouteSignals<P>,
  "routeState"
> & {
  readonly routeState: Signal<
    Omit<RouteSnapshot<P>, "route"> & { route: State<P> }
  >;
} {
  const signals = injectOrThrow(ROUTE, "injectRoute") as RouteSignals<P>;

  if (!signals.routeState().route) {
    throw new Error(
      "injectRoute called with no active route. Did you forget to await router.start() before rendering, or is the router stopped/disposed?",
    );
  }

  return signals as Omit<RouteSignals<P>, "routeState"> & {
    readonly routeState: Signal<
      Omit<RouteSnapshot<P>, "route"> & { route: State<P> }
    >;
  };
}
