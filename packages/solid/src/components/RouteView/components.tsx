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

// §8.1 audit fix (LOW #8) — three marker factories share the
// `$$type + children getter` skeleton plus a small per-marker payload.
// `createMarker` keeps the shared shape in one place; each public factory
// (Match/Self/NotFound) only provides what differs.
//
// The `children` getter (not a plain field) is intentional: it lets the
// marker capture Solid's reactive `props.children` lazily, so swapping the
// marker content in a parent component re-evaluates at render time without
// pulling stale references.
//
// Marker objects are identified by `$$type` Symbol in RouteView/helpers.tsx,
// not rendered as JSX. The `as unknown as JSX.Element` cast is required at
// the call site because `JSX.Element` does not include arbitrary marker
// shapes.
function createMarker<M extends RouteViewMarker>(
  type: M["$$type"],
  getChildren: () => JSX.Element,
  extras?: Omit<M, "$$type" | "children">,
): JSX.Element {
  const result = {
    $$type: type,
    ...extras,
    get children(): JSX.Element {
      return getChildren();
    },
  };

  return result as unknown as JSX.Element;
}

export function Match(props: MatchProps): JSX.Element {
  return createMarker<MatchMarker>(MATCH_MARKER, () => props.children, {
    segment: props.segment,
    exact: props.exact ?? false,
    fallback: props.fallback,
  });
}

Match.displayName = "RouteView.Match";

export function Self(props: SelfProps): JSX.Element {
  return createMarker<SelfMarker>(SELF_MARKER, () => props.children, {
    fallback: props.fallback,
  });
}

Self.displayName = "RouteView.Self";

export function NotFound(props: NotFoundProps): JSX.Element {
  return createMarker<NotFoundMarker>(NOT_FOUND_MARKER, () => props.children);
}

NotFound.displayName = "RouteView.NotFound";
