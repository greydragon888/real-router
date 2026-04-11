/* eslint-disable @typescript-eslint/method-signature-style -- method syntax required for declaration merging overload (property syntax causes TS2717) */

import type { Params, State } from "@real-router/core";

export { navigationPluginFactory } from "./factory";

export type {
  NavigationPluginOptions,
  NavigationBrowser,
  NavigationMeta,
  NavigationDirection,
} from "./types";

declare module "@real-router/types" {
  interface StateContext {
    navigation?: import("./types").NavigationMeta;
  }
}

declare module "@real-router/core" {
  interface Router {
    buildUrl: (name: string, params?: Params) => string;
    matchUrl: (url: string) => State | undefined;
    replaceHistoryState: (
      name: string,
      params?: Params,
      title?: string,
    ) => void;
    peekBack: () => State | undefined;
    peekForward: () => State | undefined;
    hasVisited: (routeName: string) => boolean;
    getVisitedRoutes: () => string[];
    getRouteVisitCount: (routeName: string) => number;
    traverseToLast: (routeName: string) => Promise<State>;
    canGoBack: () => boolean;
    canGoForward: () => boolean;
    canGoBackTo: (routeName: string) => boolean;
    start(path?: string): Promise<State>;
  }
}
