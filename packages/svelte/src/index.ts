// Components
export { default as RouteView } from "./components/RouteView.svelte";

export { default as Link } from "./components/Link.svelte";

export { default as Lazy } from "./components/Lazy.svelte";

// Composables
export { useRouter } from "./composables/useRouter.svelte";

export { useNavigator } from "./composables/useNavigator.svelte";

export { useRouteUtils } from "./composables/useRouteUtils.svelte";

export { useRoute } from "./composables/useRoute.svelte";

export { useRouteNode } from "./composables/useRouteNode.svelte";

export { useRouterTransition } from "./composables/useRouterTransition.svelte";

// Context
export { default as RouterProvider } from "./RouterProvider.svelte";

export { ROUTER_KEY, NAVIGATOR_KEY, ROUTE_KEY } from "./context";

// Types
export type { LinkProps, RouteContext } from "./types";

export type { Navigator } from "@real-router/core";

export type { RouterTransitionSnapshot } from "@real-router/sources";
