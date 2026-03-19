import type {
  NavigationOptions,
  Params,
  Navigator,
  State,
} from "@real-router/core";
import type { ShallowRef } from "vue";

export interface RouteContext {
  navigator: Navigator;
  route: ShallowRef<State | undefined>;
  previousRoute: ShallowRef<State | undefined>;
}

export interface LinkProps<P extends Params = Params> {
  routeName: string;
  routeParams?: P;
  routeOptions?: NavigationOptions;
  class?: string;
  activeClassName?: string;
  activeStrict?: boolean;
  ignoreQueryParams?: boolean;
  target?: string;
}
