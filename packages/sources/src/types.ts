import type { State } from "@real-router/types";

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
