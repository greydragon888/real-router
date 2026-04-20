import type { NavigationOptions, Params, Router } from "@real-router/core";
import type { ReactNode } from "react";

export interface InkLinkProps<P extends Params = Params> {
  routeName: string;
  routeParams?: P;
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
