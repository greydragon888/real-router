import type {
  NavigationOptions,
  Params,
  Navigator,
  SearchParams,
  State,
} from "@real-router/core";
import type { HTMLAttributes, MouseEventHandler } from "react";

export interface RouteState<P extends Params = Params> {
  route: State<P> | undefined;
  previousRoute?: State | undefined;
}

export type RouteContext<P extends Params = Params> = RouteState<P> & {
  navigator: Navigator;
};

export interface LinkProps<
  P extends Params = Params,
> extends HTMLAttributes<HTMLAnchorElement> {
  routeName: string;
  routeParams?: P;
  /**
   * Query (search) params for the link's target (RFC-4 M2, #1548) — the path/
   * query split's view-layer channel, parallel to `routeParams`. Feeds the URL's
   * query string on click and `href`, and (with `ignoreQueryParams={false}`)
   * the active-state check. A route's query still works when passed inside
   * `routeParams`; `routeSearch` is the explicit, type-clean channel.
   */
  routeSearch?: SearchParams;
  routeOptions?: NavigationOptions;
  activeClassName?: string;
  activeStrict?: boolean;
  ignoreQueryParams?: boolean;
  /**
   * URL fragment (decoded form, no leading "#") (#532).
   * - omitted/`undefined` → preserve current fragment on same-route navigation
   * - `""` → clear fragment
   * - non-empty → set fragment
   *
   * Requires a URL plugin (browser-plugin or navigation-plugin) for full
   * round-trip; hash-plugin ignores the prop with a one-time dev warning.
   */
  hash?: string;
  target?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  onMouseOver?: MouseEventHandler<HTMLAnchorElement>;
}
