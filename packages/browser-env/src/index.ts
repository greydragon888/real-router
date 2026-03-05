export type { HistoryBrowser } from "./types";

export { isBrowserEnvironment } from "./detect";

export {
  pushState,
  replaceState,
  addPopstateListener,
  getHash,
} from "./history-api";

export { safelyEncodePath } from "./utils";

export { createWarnOnce, createHistoryFallbackBrowser } from "./ssr-fallback";
