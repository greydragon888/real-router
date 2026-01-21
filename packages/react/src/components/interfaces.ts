// packages/react/modules/components/interfaces.ts

import type {
  NavigationOptions,
  Params,
  Router,
  RouterError,
  State,
} from "@real-router/core";
import type { HTMLAttributes, MouseEventHandler } from "react";

export interface BaseLinkProps<
  P extends Params = Params,
  MP extends Params = Params,
> extends HTMLAttributes<HTMLAnchorElement> {
  router: Router;
  routeName: string;
  route?: State<P, MP> | undefined;
  previousRoute?: State | undefined;
  routeParams?: P;
  routeOptions?: NavigationOptions;
  className?: string;
  activeClassName?: string;
  activeStrict?: boolean;
  ignoreQueryParams?: boolean;
  target?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  onMouseOver?: MouseEventHandler<HTMLAnchorElement>;
  successCallback?: (state?: State<P, MP>) => void;
  errorCallback?: (error?: RouterError) => void;
}
