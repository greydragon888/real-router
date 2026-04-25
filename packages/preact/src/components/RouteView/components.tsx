import type { MatchProps, NotFoundProps, SelfProps } from "./types";

export function Match(_props: MatchProps): null {
  return null;
}

Match.displayName = "RouteView.Match";

export function Self(_props: SelfProps): null {
  return null;
}

Self.displayName = "RouteView.Self";

export function NotFound(_props: NotFoundProps): null {
  return null;
}

NotFound.displayName = "RouteView.NotFound";
