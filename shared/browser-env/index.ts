export type { HistoryBrowser, Browser, SharedFactoryState } from "./types.js";

export { isBrowserEnvironment } from "./detect.js";

export {
  pushState,
  replaceState,
  addPopstateListener,
  getHash,
} from "./history-api.js";

export { normalizeBase, safelyEncodePath } from "./utils.js";

export {
  createWarnOnce,
  createHistoryFallbackBrowser,
} from "./ssr-fallback.js";

export { getRouteFromEvent, updateBrowserState } from "./popstate-utils.js";

export { createOptionsValidator } from "./validation.js";

export { createSafeBrowser } from "./safe-browser.js";

export {
  createPopstateHandler,
  createPopstateLifecycle,
} from "./popstate-handler.js";

export type {
  PopstateHandlerDeps,
  PopstateLifecycleDeps,
} from "./popstate-handler.js";

export {
  createStartInterceptor,
  createReplaceHistoryState,
  shouldReplaceHistory,
} from "./plugin-utils.js";

export { safeParseUrl } from "./url-parsing.js";

export { extractPath, buildUrl, urlToPath } from "./url-utils.js";
