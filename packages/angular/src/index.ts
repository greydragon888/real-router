export { provideRealRouter, ROUTER, NAVIGATOR, ROUTE } from "./providers";

export type { RealRouterOptions } from "./providers";

export { provideRealRouterFactory } from "./providersFactory";

export type {
  RealRouterFactoryOptions,
  RequestDepsFactory,
  RequestPluginsFactory,
} from "./providersFactory";

export { sourceToSignal } from "./sourceToSignal";

export {
  injectRouter,
  injectNavigator,
  injectRoute,
  injectRouteNode,
  injectRouteUtils,
  injectRouterTransition,
  injectIsActiveRoute,
  injectRouteExit,
  injectRouteEnter,
} from "./functions";

export type {
  RouteExitContext,
  RouteExitHandler,
  UseRouteExitOptions,
  RouteEnterContext,
  RouteEnterHandler,
  UseRouteEnterOptions,
} from "./functions";

export { RouteView } from "./components/RouteView";

export { RouterErrorBoundary } from "./components/RouterErrorBoundary";

export type { ErrorContext } from "./components/RouterErrorBoundary";

export { ClientOnly } from "./components/ClientOnly";

export { ServerOnly } from "./components/ServerOnly";

export { NavigationAnnouncer } from "./components/NavigationAnnouncer";

export { RouteMatch } from "./directives/RouteMatch";

export { RouteSelf } from "./directives/RouteSelf";

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
