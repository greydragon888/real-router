import { createSafeBrowser } from "../../src/browser-env/index.js";

import type { Browser } from "../../src/browser-env/index.js";
import type { State } from "@real-router/core";

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
      onStateChange(state as State | undefined);
      safeBrowser.pushState(state, url);
    },
    replaceState: (state, url) => {
      onStateChange(state as State | undefined);
      safeBrowser.replaceState(state, url);
    },
  };
};
