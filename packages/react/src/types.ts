// packages/react/modules/types.ts

import type { Params, Navigator, Router, State } from "@real-router/core";
import type { MouseEvent, ReactNode } from "react";

export interface RouteState<
  P extends Params = Params,
  MP extends Params = Params,
> {
  route: State<P, MP> | undefined;
  previousRoute?: State | undefined;
}

export type RouteContext = {
  navigator: Navigator;
} & RouteState;

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
  target?: string;
  children?: ReactNode;
  previousRoute?: State;
}
