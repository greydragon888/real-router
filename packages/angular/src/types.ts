import type { Signal } from "@angular/core";
import type { Navigator, Params } from "@real-router/core";
import type { RouteSnapshot } from "@real-router/sources";

export interface RouteSignals<P extends Params = Params> {
  readonly routeState: Signal<RouteSnapshot<P>>;
  readonly navigator: Navigator;
}
