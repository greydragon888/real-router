import { createContext } from "solid-js";

import type { RouteState } from "./types";
import type { Router, Navigator } from "@real-router/core";
import type { Accessor } from "solid-js";

export interface RouterContextValue {
  router: Router;
  navigator: Navigator;
  routeSelector: (routeName: string) => boolean;
}

export const RouterContext = createContext<RouterContextValue | null>(null);

export const RouteContext = createContext<Accessor<RouteState> | null>(null);
