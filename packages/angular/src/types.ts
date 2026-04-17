import type { Signal } from "@angular/core";
import type { Navigator } from "@real-router/core";
import type { RouteSnapshot } from "@real-router/sources";

export interface RouteSignals {
  readonly routeState: Signal<RouteSnapshot>;
  readonly navigator: Navigator;
}
