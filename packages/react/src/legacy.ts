// Legacy entry point — React 18+

// Components
export { Link } from "./components/Link";

export { RouterErrorBoundary } from "./components/RouterErrorBoundary";

export { ClientOnly } from "./components/ClientOnly";

export { ServerOnly } from "./components/ServerOnly";

// Hooks
export { useRouteNode } from "./hooks/useRouteNode";

export { useRoute } from "./hooks/useRoute";

export { useNavigator } from "./hooks/useNavigator";

export { useRouter } from "./hooks/useRouter";

export { useRouteUtils } from "./hooks/useRouteUtils";

export { useRouterTransition } from "./hooks/useRouterTransition";

// Context
export { RouterProvider } from "./RouterProvider";

// Types
export type { LinkProps } from "./types";

export type { RouterErrorBoundaryProps } from "./components/RouterErrorBoundary";

export type { ClientOnlyProps } from "./components/ClientOnly";

export type { ServerOnlyProps } from "./components/ServerOnly";

export type { Navigator } from "@real-router/core";

export type { RouterTransitionSnapshot } from "@real-router/sources";
