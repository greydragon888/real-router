// React Server entry — type-only re-exports under `react-server` condition (RSC bundlers). See CLAUDE.md.

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
