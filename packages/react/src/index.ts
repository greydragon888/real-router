// Main entry point — React 19.2+

// Components
export { RouteView } from "./components/modern/RouteView";

export { Link } from "./components/Link";

export { RouterErrorBoundary } from "./components/RouterErrorBoundary";

// Hooks
export { useRouter } from "./hooks/useRouter";

export { useNavigator } from "./hooks/useNavigator";

export { useRouteUtils } from "./hooks/useRouteUtils";

export { useRoute } from "./hooks/useRoute";

export { useRouteNode } from "./hooks/useRouteNode";

export { useRouterTransition } from "./hooks/useRouterTransition";

// Context
export { RouterProvider } from "./RouterProvider";

// Types
export type { LinkProps } from "./types";

export type {
  RouteViewProps,
  RouteViewMatchProps,
  RouteViewNotFoundProps,
} from "./components/modern/RouteView";

export type { RouterErrorBoundaryProps } from "./components/RouterErrorBoundary";

export type { Navigator } from "@real-router/core";

export type { RouterTransitionSnapshot } from "@real-router/sources";
