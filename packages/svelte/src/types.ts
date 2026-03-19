import type {
  NavigationOptions,
  Navigator,
  Params,
  State,
} from "@real-router/core";

export interface RouteContext {
  readonly navigator: Navigator;
  readonly route: { readonly current: State | undefined };
  readonly previousRoute: { readonly current: State | undefined };
}

export interface LinkProps<P extends Params = Params> {
  readonly routeName: string;
  readonly routeParams?: P;
  readonly routeOptions?: NavigationOptions;
  readonly class?: string;
  readonly activeClassName?: string;
  readonly activeStrict?: boolean;
  readonly ignoreQueryParams?: boolean;
  readonly target?: string;
}
