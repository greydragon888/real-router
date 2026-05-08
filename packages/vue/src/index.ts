// Components
export { RouteView } from "./components/RouteView";

export { Link } from "./components/Link";

export { RouterErrorBoundary } from "./components/RouterErrorBoundary";

export { ClientOnly } from "./components/ClientOnly";

export { ServerOnly } from "./components/ServerOnly";

// Directives
export { vLink } from "./directives/vLink";

// Composables
export { useRouter } from "./composables/useRouter";

export { useNavigator } from "./composables/useNavigator";

export { useRouteUtils } from "./composables/useRouteUtils";

export { useRoute } from "./composables/useRoute";

export { useRouteNode } from "./composables/useRouteNode";

export { useRouterTransition } from "./composables/useRouterTransition";

export { useRouteExit } from "./composables/useRouteExit";

export { useRouteEnter } from "./composables/useRouteEnter";

// Plugin
export { createRouterPlugin } from "./createRouterPlugin";

// Context
export { RouterProvider } from "./RouterProvider";

export { RouterKey, NavigatorKey, RouteKey } from "./context";

// Types
export type { LinkProps } from "./types";

export type { RouterErrorBoundaryProps } from "./components/RouterErrorBoundary";

export type { ClientOnlyProps } from "./components/ClientOnly";

export type { ServerOnlyProps } from "./components/ServerOnly";

export type { LinkDirectiveValue } from "./directives/vLink";

export type {
  RouteViewProps,
  RouteViewMatchProps,
  RouteViewNotFoundProps,
} from "./components/RouteView";

export type {
  RouteExitContext,
  RouteExitHandler,
  UseRouteExitOptions,
} from "./composables/useRouteExit";

export type {
  RouteEnterContext,
  RouteEnterHandler,
  UseRouteEnterOptions,
} from "./composables/useRouteEnter";

export type { Navigator } from "@real-router/core";

export type { RouterTransitionSnapshot } from "@real-router/sources";
