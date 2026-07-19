import type { DefaultDependencies, Params, State } from "@real-router/core";
import type { Router } from "@real-router/core/types";

export type SsrMode = "full" | "data-only" | "client-only";

export const ALL_SSR_MODES: readonly SsrMode[] = [
  "full",
  "data-only",
  "client-only",
];

/**
 * Resolves the SSR mode for a route per-navigation.
 *
 * Receives the resolved post-routing `state` (with `name`, `params`, `path`)
 * and returns one of the allowed `SsrMode` values for the host plugin.
 *
 * The resolver is invoked **before** the plugin writes the mode marker to
 * `state.context.<modeNamespace>`, so reading `state.context.ssrDataMode` /
 * `state.context.ssrRscMode` here yields `undefined`. Branch on
 * `state.params`, `state.path`, or `state.name` instead.
 *
 * Throwing from the resolver propagates through `start()` (standard
 * navigation error pipeline) — no partial mode write occurs. Returning a
 * value outside the host plugin's `allowedModes` rejects with a typed
 * `TypeError` at runtime.
 */
export type SsrModeResolver<M extends SsrMode = SsrMode> = (state: State) => M;

export type SsrModeConfig<M extends SsrMode = SsrMode> =
  M | boolean | SsrModeResolver<M>;

/**
 * Optional context object passed to the loader. The `signal` field is the
 * navigation's `AbortController.signal` when the plugin's `subscribeLeave`
 * handler invokes the loader (#605 `invalidate()` → CSR refresh path);
 * `undefined` from the `start` interceptor (SSR boot path — apps that need
 * a request-scoped signal use `getDep("abortSignal")` injected via
 * `cloneRouter(base, { abortSignal })`, see `createRequestScope` and
 * `withTimeout({ upstreamSignal })` patterns).
 *
 * Loaders ignoring the second argument remain compatible (TypeScript
 * contravariance).
 */
export interface SsrLoaderContext {
  signal: AbortSignal;
}

export type SsrLoaderFn<T> = (
  params: Params,
  context?: SsrLoaderContext,
) => Promise<T> | T;

export type SsrLoaderFnFactory<
  T,
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = (
  router: Router<Dependencies>,
  getDependency: <K extends keyof Dependencies>(key: K) => Dependencies[K],
) => SsrLoaderFn<T>;

export interface SsrRouteEntryObject<
  T,
  M extends SsrMode = SsrMode,
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  ssr?: SsrModeConfig<M>;
  loader?: SsrLoaderFnFactory<T, Dependencies>;
}

export type SsrRouteEntry<
  T,
  M extends SsrMode = SsrMode,
  Dependencies extends DefaultDependencies = DefaultDependencies,
> =
  SsrLoaderFnFactory<T, Dependencies> | SsrRouteEntryObject<T, M, Dependencies>;

export type SsrLoaderFactoryMap<
  T,
  M extends SsrMode = SsrMode,
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = Record<string, SsrRouteEntry<T, M, Dependencies>>;

export interface SsrLoaderPluginConfig {
  namespace: string;
  modeNamespace: string;
  errorPrefix: string;
  allowedModes?: readonly SsrMode[];
  /**
   * When set, the plugin recognises `defer()` payloads from loaders.
   * Critical data is written to `<namespace>`, deferred promises to
   * `<deferredNamespace>`, and the deferred key list (for client-side
   * registry hydration) to `<deferredKeysNamespace>`.
   *
   * Both fields must be set together; one without the other rejects at
   * factory-time.
   */
  deferredNamespace?: string;
  deferredKeysNamespace?: string;
}
