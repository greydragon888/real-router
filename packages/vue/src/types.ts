import type {
  NavigationOptions,
  Params,
  Navigator,
  State,
} from "@real-router/core";
import type { Ref } from "vue";

/**
 * `route`/`previousRoute` are read-only reactive references. They may be
 * implemented as `shallowRef` or `computed` depending on the composable
 * (`useRoute` mirrors via `shallowRef`, `useRouteNode` derives via `computed`),
 * but consumers only need `.value` read access — typed as `Readonly<Ref<…>>`.
 */
export interface RouteContext<P extends Params = Params> {
  navigator: Navigator;
  route: Readonly<Ref<State<P> | undefined>>;
  previousRoute: Readonly<Ref<State | undefined>>;
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
