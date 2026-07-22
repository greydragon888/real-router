export { createSsrLoaderPlugin } from "./createSsrLoaderPlugin.js";

export { createLoadersValidator } from "./createLoadersValidator.js";

export { clearStale, isStale, markStale } from "./staleRegistry.js";

export { defer, isDeferred, DEFER_BRAND } from "./defer.js";

export type { DeferredPayload } from "./defer.js";

export { ensureRegistryPromise } from "./deferRegistryClient.js";

export {
  getDeferBootstrapScript,
  formatSettleScript,
  escapeForScript,
} from "./deferWireFormat.js";

export { ALL_SSR_MODES } from "./types.js";

export type {
  SsrLoaderContext,
  SsrLoaderTarget,
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
