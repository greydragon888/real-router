import type { NavigationOptions, Params, State } from "@real-router/core";
import type { JSX } from "solid-js";

export interface RouteState<
  P extends Params = Params,
  MP extends Params = Params,
> {
  route: State<P, MP> | undefined;
  previousRoute?: State | undefined;
}

export interface LinkProps<P extends Params = Params> extends Omit<
  JSX.HTMLAttributes<HTMLAnchorElement>,
  "onClick"
> {
  routeName: string;
  routeParams?: P;
  routeOptions?: NavigationOptions;
  activeClassName?: string;
  activeStrict?: boolean;
  ignoreQueryParams?: boolean;
  target?: string;
  onClick?: (evt: MouseEvent) => void;
}
