export { provideRealRouter, ROUTER, NAVIGATOR, ROUTE } from "./providers";

export { sourceToSignal } from "./sourceToSignal";

export {
  injectRouter,
  injectNavigator,
  injectRoute,
  injectRouteNode,
  injectRouteUtils,
  injectRouterTransition,
  injectIsActiveRoute,
} from "./functions";

export { RouteView } from "./components/RouteView";

export { RouterErrorBoundary } from "./components/RouterErrorBoundary";

export type { ErrorContext } from "./components/RouterErrorBoundary";

export { NavigationAnnouncer } from "./components/NavigationAnnouncer";

export { RouteMatch } from "./directives/RouteMatch";

export { RouteNotFound } from "./directives/RouteNotFound";

export { RealLink } from "./directives/RealLink";

export { RealLinkActive } from "./directives/RealLinkActive";

export type { RouteSignals } from "./types";

export type {
  RouteSnapshot,
  RouterTransitionSnapshot,
  RouterErrorSnapshot,
} from "@real-router/sources";

export type { Navigator } from "@real-router/core";
