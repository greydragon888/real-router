import type {
  NavigationOptions,
  Params,
  Router,
  SearchParams,
} from "@real-router/core";
import type { ReactNode } from "react";

export interface InkLinkProps<P extends Params = Params> {
  routeName: string;
  routeParams?: P;
  /**
   * Query (search) params for the link's target (RFC-4 M2, #1548) — parallel to
   * `routeParams`, the path/query split's view-layer channel.
   */
  routeSearch?: SearchParams;
  routeOptions?: NavigationOptions;
  activeStrict?: boolean;
  ignoreQueryParams?: boolean;
  children?: ReactNode;
  color?: string;
  activeColor?: string;
  focusColor?: string;
  inverse?: boolean;
  activeInverse?: boolean;
  focusInverse?: boolean;
  id?: string;
  autoFocus?: boolean;
  onSelect?: () => void;
}

export interface InkRouterProviderProps {
  router: Router;
  children?: ReactNode;
}
