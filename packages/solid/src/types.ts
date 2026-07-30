import type {
  NavigationOptions,
  NavigationTarget,
  Params,
  SearchParams,
  State,
} from "@real-router/core";
import type { JSX } from "solid-js";

export interface RouteState<P extends Params = Params> {
  route: State<P> | undefined;
  previousRoute?: State | undefined;
}

/** Props shared by both `<Link>` forms (see react `LinkProps` for the rationale). */
interface LinkCommonProps extends Omit<
  JSX.HTMLAttributes<HTMLAnchorElement>,
  "onClick"
> {
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
