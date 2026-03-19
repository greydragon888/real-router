export interface RouteViewProps {
  readonly nodeName: string;
  readonly keepAlive?: boolean;
}

export interface MatchProps {
  readonly segment: string;
  readonly exact?: boolean;
}

export type NotFoundProps = Record<string, never>;
