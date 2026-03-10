import type { State } from "@real-router/core";

export interface RouteSnapshot {
  route: State | undefined;
  previousRoute: State | undefined;
}

export interface RouteNodeSnapshot {
  route: State | undefined;
  previousRoute: State | undefined;
}

export interface RouterSource<T> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  destroy: () => void;
}

export interface ActiveRouteSourceOptions {
  strict?: boolean;
  ignoreQueryParams?: boolean;
}

export interface RouterTransitionSnapshot {
  isTransitioning: boolean;
  toRoute: State | null;
  fromRoute: State | null;
}
