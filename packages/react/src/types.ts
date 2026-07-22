import type {
  NavigationOptions,
  NavigationTarget,
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

/**
 * Props shared by both `<Link>` forms — everything except the mutually-exclusive
 * navigation-target channels. `routeOptions` / `hash` stay here (they apply to
 * both forms; hash is not part of `NavigationTarget` — #532).
 */
interface LinkCommonProps extends HTMLAttributes<HTMLAnchorElement> {
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

/** Channel form: `routeName` + optional `routeParams` / `routeSearch`. */
interface LinkChannelProps<P extends Params = Params> {
  routeName: string;
  routeParams?: P;
  /**
   * Query (search) params for the link's target (RFC-4 M2, #1548) — the path/
   * query split's view-layer channel, parallel to `routeParams`. Feeds the URL's
   * query string on click and `href`, and (with `ignoreQueryParams={false}`)
   * the active-state check.
   */
  routeSearch?: SearchParams;
  to?: never;
}

/**
 * Descriptor form (RFC-4 M2 B2, #1548): `to={{ name, params?, search? }}` — a
 * single `NavigationTarget`, mutually exclusive with the channel props above.
 */
interface LinkDescriptorProps<P extends Params = Params> {
  to: NavigationTarget<P>;
  routeName?: never;
  routeParams?: never;
  routeSearch?: never;
}

export type LinkProps<P extends Params = Params> = LinkCommonProps &
  (LinkChannelProps<P> | LinkDescriptorProps<P>);
