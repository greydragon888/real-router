import type { ReactNode } from "react";

export interface RouteViewProps {
  /** Route tree node name to subscribe to. "" for root. */
  readonly nodeName: string;
  /** <RouteView.Match> and <RouteView.NotFound> elements. */
  readonly children: ReactNode;
}

export interface MatchProps {
  /** Route segment to match against. */
  readonly segment: string;
  /** Exact match only (no descendants). Defaults to false. */
  readonly exact?: boolean;
  /** Preserve component state when deactivated (React Activity). Defaults to false. */
  readonly keepAlive?: boolean;
  /** Content to render when matched. */
  readonly children: ReactNode;
}

export interface NotFoundProps {
  /** Content to render on UNKNOWN_ROUTE. */
  readonly children: ReactNode;
}
