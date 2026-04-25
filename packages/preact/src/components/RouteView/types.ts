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

export interface SelfProps {
  /** Fallback content while children are suspended. */
  readonly fallback?: ComponentChildren;
  /** Content to render when the active route name equals the parent RouteView's nodeName. */
  readonly children: ComponentChildren;
}

export interface NotFoundProps {
  readonly children: ComponentChildren;
}
