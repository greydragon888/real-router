import type {
  NavigationOptions,
  Params,
  Navigator,
  State,
} from "@real-router/core";
import type { JSX } from "preact";

export interface RouteState<P extends Params = Params> {
  route: State<P> | undefined;
  previousRoute?: State | undefined;
}

export type RouteContext<P extends Params = Params> = {
  navigator: Navigator;
} & RouteState<P>;

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
