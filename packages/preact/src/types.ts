import type {
  NavigationOptions,
  Params,
  Navigator,
  State,
} from "@real-router/core";
import type { JSX } from "preact";

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

export interface LinkProps<P extends Params = Params> extends Omit<
  JSX.HTMLAttributes<HTMLAnchorElement>,
  "className"
> {
  routeName: string;
  routeParams?: P;
  routeOptions?: NavigationOptions;
  className?: string;
  activeClassName?: string;
  activeStrict?: boolean;
  ignoreQueryParams?: boolean;
  target?: string;
}
