import type { State } from "@real-router/core";

export interface RouteSnapshot {
  route: State | undefined;
  previousRoute: State | undefined;
}

export interface RouteNodeSnapshot {
  route: State | undefined;
  previousRoute: State | undefined;
}

export interface RouterStore<T> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  destroy: () => void;
}

export interface ActiveRouteStoreOptions {
  strict?: boolean;
  ignoreQueryParams?: boolean;
}
