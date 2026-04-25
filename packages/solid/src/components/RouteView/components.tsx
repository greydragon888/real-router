import type { MatchProps, NotFoundProps, SelfProps } from "./types";
import type { JSX } from "solid-js";

// Local (non-global) Symbols — Symbol.for() would expose markers to spoofing
// via the global Symbol registry. See Gotchas section "RouteView Marker Objects".
export const MATCH_MARKER = Symbol("RouteView.Match");

export const SELF_MARKER = Symbol("RouteView.Self");

export const NOT_FOUND_MARKER = Symbol("RouteView.NotFound");

export interface MatchMarker {
  $$type: typeof MATCH_MARKER;
  segment: string;
  exact: boolean;
  fallback?: JSX.Element;
  children: JSX.Element;
}

export interface SelfMarker {
  $$type: typeof SELF_MARKER;
  fallback?: JSX.Element;
  children: JSX.Element;
}

export interface NotFoundMarker {
  $$type: typeof NOT_FOUND_MARKER;
  children: JSX.Element;
}

export type RouteViewMarker = MatchMarker | SelfMarker | NotFoundMarker;

export function Match(props: MatchProps): JSX.Element {
  const result: MatchMarker = {
    $$type: MATCH_MARKER,
    segment: props.segment,
    exact: props.exact ?? false,
    fallback: props.fallback,
    get children(): JSX.Element {
      return props.children;
    },
  };

  // Marker object is identified by $$type Symbol in RouteView/helpers.tsx,
  // not rendered as JSX. Cast required because JSX.Element does not include
  // arbitrary marker shapes.
  return result as unknown as JSX.Element;
}

Match.displayName = "RouteView.Match";

export function Self(props: SelfProps): JSX.Element {
  const result: SelfMarker = {
    $$type: SELF_MARKER,
    fallback: props.fallback,
    get children(): JSX.Element {
      return props.children;
    },
  };

  // See Match for the marker-pattern rationale.
  return result as unknown as JSX.Element;
}

Self.displayName = "RouteView.Self";

export function NotFound(props: NotFoundProps): JSX.Element {
  const result: NotFoundMarker = {
    $$type: NOT_FOUND_MARKER,
    get children(): JSX.Element {
      return props.children;
    },
  };

  // See Match for the marker-pattern rationale.
  return result as unknown as JSX.Element;
}

NotFound.displayName = "RouteView.NotFound";
