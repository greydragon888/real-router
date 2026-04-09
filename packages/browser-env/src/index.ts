export type { HistoryBrowser, Browser, SharedFactoryState } from "./types";

export { isBrowserEnvironment } from "./detect";

export {
  pushState,
  replaceState,
  addPopstateListener,
  getHash,
} from "./history-api";

export { normalizeBase, safelyEncodePath } from "./utils";

export { createWarnOnce, createHistoryFallbackBrowser } from "./ssr-fallback";

export { getRouteFromEvent, updateBrowserState } from "./popstate-utils";

export { createOptionsValidator } from "./validation";

export { createSafeBrowser } from "./safe-browser";

export {
  createPopstateHandler,
  createPopstateLifecycle,
} from "./popstate-handler";

export type {
  PopstateHandlerDeps,
  PopstateLifecycleDeps,
} from "./popstate-handler";

export {
  createStartInterceptor,
  createReplaceHistoryState,
  shouldReplaceHistory,
} from "./plugin-utils";

export { safeParseUrl } from "./url-parsing";

export { extractPath, buildUrl, urlToPath } from "./url-utils";
