import type { JSX } from "solid-js";

export interface RouteViewProps {
  readonly nodeName: string;
  readonly children: JSX.Element;
}

export interface MatchProps {
  readonly segment: string;
  readonly exact?: boolean;
  readonly fallback?: JSX.Element;
  readonly children: JSX.Element;
}

export interface NotFoundProps {
  readonly children: JSX.Element;
}
