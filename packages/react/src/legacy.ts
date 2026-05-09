// Legacy entry point — React 18+
//
// SSR-aware components/hooks live at `@real-router/react/legacy/ssr`
// (subset of the React 19+ `/ssr` surface — `<Await>` is excluded since
// it depends on `use(promise)`).

// Components
export { Link } from "./components/Link";

export { RouterErrorBoundary } from "./components/RouterErrorBoundary";

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

export type { Navigator } from "@real-router/core";

export type { RouterTransitionSnapshot } from "@real-router/sources";
