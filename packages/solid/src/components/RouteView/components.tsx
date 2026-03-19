import type { MatchProps, NotFoundProps } from "./types";
import type { JSX } from "solid-js";

export const MATCH_MARKER = Symbol.for("RouteView.Match");

export const NOT_FOUND_MARKER = Symbol.for("RouteView.NotFound");

export interface MatchMarker {
  $$type: typeof MATCH_MARKER;
  segment: string;
  exact: boolean;
  fallback?: JSX.Element;
  children: JSX.Element;
}

export interface NotFoundMarker {
  $$type: typeof NOT_FOUND_MARKER;
  children: JSX.Element;
}

export type RouteViewMarker = MatchMarker | NotFoundMarker;

export function Match(props: MatchProps): JSX.Element {
  const result = {
    $$type: MATCH_MARKER,
    segment: props.segment,
    exact: props.exact ?? false,
    fallback: props.fallback,
    get children(): JSX.Element {
      return props.children;
    },
  } as MatchMarker;

  return result as unknown as JSX.Element;
}

Match.displayName = "RouteView.Match";

export function NotFound(props: NotFoundProps): JSX.Element {
  const result = {
    $$type: NOT_FOUND_MARKER,
    get children(): JSX.Element {
      return props.children;
    },
  } as NotFoundMarker;

  return result as unknown as JSX.Element;
}

NotFound.displayName = "RouteView.NotFound";
