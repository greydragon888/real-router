import type { ReactNode } from "react";

export interface RouteViewProps {
  /** Route tree node name to subscribe to. "" for root. */
  readonly nodeName: string;
  /** <RouteView.Match>, <RouteView.Self>, and <RouteView.NotFound> elements. */
  readonly children: ReactNode;
}

export interface MatchProps {
  /** Route segment to match against. */
  readonly segment: string;
  /** Exact match only (no descendants). Defaults to false. */
  readonly exact?: boolean;
  /** Preserve component state when deactivated (React Activity). Defaults to false. */
  readonly keepAlive?: boolean;
  /** Fallback content to show while children are suspended. */
  readonly fallback?: ReactNode;
  /** Content to render when matched. */
  readonly children: ReactNode;
}

export interface SelfProps {
  /**
   * Fallback content to show while children are suspended.
   *
   * Symmetric with `<RouteView.Match fallback>` — wraps children in
   * `<Suspense>` when defined.
   */
  readonly fallback?: ReactNode;
  /** Content to render when the active route name equals the parent RouteView's nodeName. */
  readonly children: ReactNode;
}

export interface NotFoundProps {
  /** Content to render on UNKNOWN_ROUTE. */
  readonly children: ReactNode;
}
