// Main entry point — React 19.2+

// Components
export { RouteView } from "./components/modern/RouteView";

export { Link } from "./components/Link";

export { RouterErrorBoundary } from "./components/RouterErrorBoundary";

export { ClientOnly } from "./components/ClientOnly";

export { ServerOnly } from "./components/ServerOnly";

// Hooks
export { useRouter } from "./hooks/useRouter";

export { useNavigator } from "./hooks/useNavigator";

export { useRouteUtils } from "./hooks/useRouteUtils";

export { useRoute } from "./hooks/useRoute";

export { useRouteNode } from "./hooks/useRouteNode";

export { useRouterTransition } from "./hooks/useRouterTransition";

export { useRouteExit } from "./hooks/useRouteExit";

export { useRouteEnter } from "./hooks/useRouteEnter";

// Context
export { RouterProvider } from "./RouterProvider";

// Types
export type { LinkProps } from "./types";

export type {
  RouteExitContext,
  RouteExitHandler,
  UseRouteExitOptions,
} from "./hooks/useRouteExit";

export type {
  RouteEnterContext,
  RouteEnterHandler,
  UseRouteEnterOptions,
} from "./hooks/useRouteEnter";

export type {
  RouteViewProps,
  RouteViewMatchProps,
  RouteViewSelfProps,
  RouteViewNotFoundProps,
} from "./components/modern/RouteView";

export type { RouterErrorBoundaryProps } from "./components/RouterErrorBoundary";

export type { ClientOnlyProps } from "./components/ClientOnly";

export type { ServerOnlyProps } from "./components/ServerOnly";

export type { Navigator } from "@real-router/core";

export type { RouterTransitionSnapshot } from "@real-router/sources";
