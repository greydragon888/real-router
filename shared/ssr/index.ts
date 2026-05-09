export { createSsrLoaderPlugin } from "./createSsrLoaderPlugin.js";

export { createLoadersValidator } from "./createLoadersValidator.js";

export { markStale } from "./staleRegistry.js";

export { defer, isDeferred, DEFER_BRAND } from "./defer.js";

export type { DeferredPayload } from "./defer.js";

export {
  ensureRegistryPromise,
  getDeferBootstrapScript,
  formatSettleScript,
  escapeForScript,
} from "./deferRegistry.js";

export type {
  SsrLoaderContext,
  SsrLoaderFn,
  SsrLoaderFnFactory,
  SsrLoaderFactoryMap,
  SsrLoaderPluginConfig,
  SsrMode,
  SsrModeConfig,
  SsrModeResolver,
  SsrRouteEntry,
  SsrRouteEntryObject,
} from "./types.js";
