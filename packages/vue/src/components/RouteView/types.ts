import type { VNode } from "vue";

export interface RouteViewProps {
  readonly nodeName: string;
  readonly keepAlive?: boolean;
}

export interface MatchProps {
  readonly segment: string;
  readonly exact?: boolean;
  readonly fallback?: VNode | (() => VNode);
  readonly keepAlive?: boolean;
}

export type NotFoundProps = Record<string, never>;
