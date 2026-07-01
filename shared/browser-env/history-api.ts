import type { HistoryBrowser } from "./types.js";

export const pushState = (state: unknown, path: string): void => {
  globalThis.history.pushState(state, "", path);
};

export const replaceState = (state: unknown, path: string): void => {
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

export const addHashChangeListener: HistoryBrowser["addHashChangeListener"] = (
  fn,
) => {
  globalThis.addEventListener("hashchange", fn);

  return () => {
    globalThis.removeEventListener("hashchange", fn);
  };
};

export const getHash = (): string => globalThis.location.hash;
