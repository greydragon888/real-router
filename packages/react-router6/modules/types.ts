// packages/react-router6/modules/types.ts

import type { MouseEvent, ReactNode } from "react";
import type { Params, Router, RouterError, State } from "router6";

export interface RouteState<
  P extends Params = Params,
  MP extends Params = Params,
> {
  route: State<P, MP> | undefined;
  previousRoute?: State | undefined;
}

export type RouteContext = {
  router: Router;
} & RouteState;

export type UnsubscribeFn = () => void;

export interface BaseLinkProps {
  [key: string]: unknown;
  router: Router;
  routeName: string;
  routeParams?: Params;
  routeOptions?: {
    [key: string]: unknown;
    reload?: boolean;
    replace?: boolean;
  };
  className?: string;
  activeClassName?: string;
  activeStrict?: boolean;
  ignoreQueryParams?: boolean;
  onClick?: (evt: MouseEvent<HTMLAnchorElement>) => void;
  successCallback?: (state?: State) => void;
  errorCallback?: (err: RouterError) => void;
  target?: string;
  children?: ReactNode;
  previousRoute?: State;
}

export interface ActiveRouteOptions {
  activeStrict?: boolean;
  ignoreQueryParams?: boolean;
}
