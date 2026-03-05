import { isStateStrict as isState } from "type-guards";

import type { Browser } from "./types";
import type { PluginApi, State, Params } from "@real-router/core";

export function getRouteFromEvent(
  evt: PopStateEvent,
  api: PluginApi,
  browser: Browser,
): { name: string; params: Params } | undefined {
  if (isState(evt.state)) {
    return { name: evt.state.name, params: evt.state.params };
  }

  const state = api.matchPath(browser.getLocation());

  return state ? { name: state.name, params: state.params } : undefined;
}

export function updateBrowserState(
  state: State,
  url: string,
  replace: boolean,
  browser: Browser,
): void {
  const historyState = {
    meta: state.meta,
    name: state.name,
    params: state.params,
    path: state.path,
  };

  if (replace) {
    browser.replaceState(historyState, url);
  } else {
    browser.pushState(historyState, url);
  }
}
