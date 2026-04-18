import type {
  NavigationOptions,
  Params,
  Navigator,
  State,
} from "@real-router/core";
import type { HTMLAttributes, MouseEventHandler } from "react";

export interface RouteState<P extends Params = Params> {
  route: State<P> | undefined;
  previousRoute?: State | undefined;
}

export type RouteContext<P extends Params = Params> = {
  navigator: Navigator;
} & RouteState<P>;

export interface LinkProps<
  P extends Params = Params,
> extends HTMLAttributes<HTMLAnchorElement> {
  routeName: string;
  routeParams?: P;
  routeOptions?: NavigationOptions;
  activeClassName?: string;
  activeStrict?: boolean;
  ignoreQueryParams?: boolean;
  target?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  onMouseOver?: MouseEventHandler<HTMLAnchorElement>;
}
