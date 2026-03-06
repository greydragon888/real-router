import type { HistoryBrowser } from "./types";
import type { State } from "@real-router/core";

export const pushState = (state: State, path: string): void => {
  globalThis.history.pushState(state, "", path);
};

export const replaceState = (state: State, path: string): void => {
  globalThis.history.replaceState(state, "", path);
};

export const addPopstateListener: HistoryBrowser["addPopstateListener"] = (
  fn,
) => {
  globalThis.addEventListener("popstate", fn);

  return () => {
    globalThis.removeEventListener("popstate", fn);
  };
};

export const getHash = (): string => globalThis.location.hash;
