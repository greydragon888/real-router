// Ink entry point — React 19.2+ & Ink 7+

// Components
export { InkLink } from "./components/InkLink";

export { InkRouterProvider } from "./components/InkRouterProvider";

export { RouterErrorBoundary } from "./components/RouterErrorBoundary";

// Hooks
export { useRouteNode } from "./hooks/useRouteNode";

export { useRoute } from "./hooks/useRoute";

export { useNavigator } from "./hooks/useNavigator";

export { useRouter } from "./hooks/useRouter";

export { useRouteUtils } from "./hooks/useRouteUtils";

export { useRouterTransition } from "./hooks/useRouterTransition";

// Types
export type { InkLinkProps, InkRouterProviderProps } from "./ink-types";

export type { RouterErrorBoundaryProps } from "./components/RouterErrorBoundary";

export type { Navigator } from "@real-router/core";

export type { RouterTransitionSnapshot } from "@real-router/sources";
