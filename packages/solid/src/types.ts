import type {
  NavigationOptions,
  Params,
  SearchParams,
  State,
} from "@real-router/core";
import type { JSX } from "solid-js";

export interface RouteState<P extends Params = Params> {
  route: State<P> | undefined;
  previousRoute?: State | undefined;
}

export interface LinkProps<P extends Params = Params> extends Omit<
  JSX.HTMLAttributes<HTMLAnchorElement>,
  "onClick"
> {
  routeName: string;
  routeParams?: P;
  /**
   * Query (search) params for the link's target (RFC-4 M2, #1548) — parallel to
   * `routeParams`, the path/query split's view-layer channel.
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
   */
  hash?: string;
  target?: string;
  onClick?: (evt: MouseEvent) => void;
}
