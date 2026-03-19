// Components
export { RouteView } from "./components/RouteView";

export { Link } from "./components/Link";

// Directives
export { vLink } from "./directives/vLink";

// Composables
export { useRouter } from "./composables/useRouter";

export { useNavigator } from "./composables/useNavigator";

export { useRouteUtils } from "./composables/useRouteUtils";

export { useRoute } from "./composables/useRoute";

export { useRouteNode } from "./composables/useRouteNode";

export { useRouterTransition } from "./composables/useRouterTransition";

// Plugin
export { createRouterPlugin } from "./createRouterPlugin";

// Context
export { RouterProvider } from "./RouterProvider";

export { RouterKey, NavigatorKey, RouteKey } from "./context";

// Types
export type { LinkProps } from "./types";

export type { LinkDirectiveValue } from "./directives/vLink";

export type {
  RouteViewProps,
  RouteViewMatchProps,
  RouteViewNotFoundProps,
} from "./components/RouteView";

export type { Navigator } from "@real-router/core";

export type { RouterTransitionSnapshot } from "@real-router/sources";
