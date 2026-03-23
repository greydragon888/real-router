import type { ComponentChildren } from "preact";

export interface RouteViewProps {
  readonly nodeName: string;
  readonly children: ComponentChildren;
}

export interface MatchProps {
  readonly segment: string;
  readonly exact?: boolean;
  readonly fallback?: ComponentChildren;
  readonly children: ComponentChildren;
}

export interface NotFoundProps {
  readonly children: ComponentChildren;
}
