/* eslint-disable @typescript-eslint/method-signature-style -- method syntax required for declaration merging overload (property syntax causes TS2717) */

import type { Params, State } from "@real-router/core";

export { navigationPluginFactory } from "./factory";

export { PLUGIN_SYNC_INFO } from "./navigation-browser";

export type {
  NavigationPluginOptions,
  NavigationBrowser,
  NavigationMeta,
  NavigationDirection,
} from "./types";

declare module "@real-router/core/types" {
  interface StateContext {
    navigation?: import("./types").NavigationMeta;
    /**
     * URL fragment ("hash") layer state (#532). Populated by both URL plugins
     * (navigation-plugin, browser-plugin) — they are mutually exclusive at
     * runtime, so only one writes to this namespace.
     */
    url?: import("./browser-env").UrlContext;
  }

  interface NavigationOptions {
    /**
     * URL fragment override (decoded, no leading "#") (#532).
     * Tri-state: `undefined` → preserve current; `""` → clear; non-empty → set.
     */
    hash?: string;
    /**
     * @internal — set by URL plugins on hash-only browser-driven navigation.
     * Subscribers should branch on `state.context.url.hashChanged` instead.
     */
    hashChange?: boolean;
  }
}

declare module "@real-router/core" {
  interface Router {
    buildUrl(
      name: string,
      params?: Params,
      options?: { hash?: string },
    ): string;
    matchUrl(url: string): State | undefined;
    replaceHistoryState(
      name: string,
      params?: Params,
      options?: { hash?: string },
    ): void;
    peekBack(): State | undefined;
    peekForward(): State | undefined;
    hasVisited(routeName: string): boolean;
    getVisitedRoutes(): string[];
    getRouteVisitCount(routeName: string): number;
    traverseToLast(routeName: string): Promise<State>;
    canGoBack(): boolean;
    canGoForward(): boolean;
    canGoBackTo(routeName: string): boolean;
    start(path?: string): Promise<State>;
  }
}
