// Main entry point — React 19.2+
//
// Client-side hooks + components. SSR-aware components and hooks
// (`<ClientOnly>`, `<ServerOnly>`, `<Await>`, `<Streamed>`, `useDeferred`)
// have moved to the `/ssr` subpath — import them from
// `@real-router/react/ssr` to opt into the SSR-feature surface.

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

export type { Navigator } from "@real-router/core";

export type { RouterTransitionSnapshot } from "@real-router/sources";
