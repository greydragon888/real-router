// Main entry point — React 19.2+

// Components
export { Link } from "./components/Link";

export { RouteView } from "./components/modern/RouteView";

// Hooks
export { useRouteNode } from "./hooks/useRouteNode";

export { useRoute } from "./hooks/useRoute";

export { useNavigator } from "./hooks/useNavigator";

export { useRouter } from "./hooks/useRouter";

export { useRouteUtils } from "./hooks/useRouteUtils";

export { useIsActiveRoute } from "./hooks/useIsActiveRoute";

export { useRouterTransition } from "./hooks/useRouterTransition";

// Context
export { RouterProvider } from "./RouterProvider";

export { RouterContext, RouteContext, NavigatorContext } from "./context";

// Types
export type { LinkProps } from "./types";

export type {
  RouteViewProps,
  RouteViewMatchProps,
  RouteViewNotFoundProps,
} from "./components/modern/RouteView";

export type { Navigator } from "@real-router/core";

export type { RouterTransitionSnapshot } from "@real-router/sources";
