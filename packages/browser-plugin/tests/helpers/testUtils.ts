import { createSafeBrowser } from "browser-env";

import type { State } from "@real-router/core";
import type { Browser } from "browser-env";

export const noop = (): void => undefined;

export const routerConfig = [
  {
    name: "users",
    path: "/users",
    children: [
      { name: "view", path: "/view/:id" },
      { name: "list", path: "/list" },
    ],
  },
  { name: "home", path: "/home" },
  { name: "index", path: "/" },
];

export const withoutMeta = (
  state: State,
): {
  name: string;
  params: Record<string, unknown>;
  path: string;
} => ({
  name: state.name,
  params: state.params,
  path: state.path,
});

export const createMockedBrowser = (
  onStateChange: (state: State | undefined) => void,
): Browser => {
  const safeBrowser = createSafeBrowser(
    () => globalThis.location.pathname + globalThis.location.search,
    "browser-plugin",
  );

  return {
    ...safeBrowser,
    pushState: (state, url) => {
      onStateChange(state);
      safeBrowser.pushState(state, url);
    },
    replaceState: (state, url) => {
      onStateChange(state);
      safeBrowser.replaceState(state, url);
    },
  };
};
