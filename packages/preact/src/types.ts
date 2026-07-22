import type {
  NavigationOptions,
  NavigationTarget,
  Params,
  Navigator,
  SearchParams,
  State,
} from "@real-router/core";
import type { HTMLAttributes } from "preact";

export interface RouteState<P extends Params = Params> {
  route: State<P> | undefined;
  previousRoute?: State | undefined;
}

export type RouteContext<P extends Params = Params> = RouteState<P> & {
  navigator: Navigator;
};

/** Props shared by both `<Link>` forms (see react `LinkProps` for the rationale). */
interface LinkCommonProps extends Omit<
  HTMLAttributes<HTMLAnchorElement>,
  "className"
> {
  routeOptions?: NavigationOptions;
  className?: string;
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
}

/** Channel form: `routeName` + optional `routeParams` / `routeSearch`. */
interface LinkChannelProps<P extends Params = Params> {
  routeName: string;
  routeParams?: P;
  /**
   * Query (search) params for the link's target (RFC-4 M2, #1548) — parallel to
   * `routeParams`, the path/query split's view-layer channel.
   */
  routeSearch?: SearchParams;
  to?: never;
}

/** Descriptor form (RFC-4 M2 B2, #1548): `to={NavigationTarget}`, exclusive with channel props. */
interface LinkDescriptorProps<P extends Params = Params> {
  to: NavigationTarget<P>;
  routeName?: never;
  routeParams?: never;
  routeSearch?: never;
}

export type LinkProps<P extends Params = Params> = LinkCommonProps &
  (LinkChannelProps<P> | LinkDescriptorProps<P>);
