import type {
  DefaultDependencies,
  Params,
  Router,
  State,
} from "@real-router/types";

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
  | M
  | boolean
  | SsrModeResolver<M>;

export type SsrLoaderFn<T> = (params: Params) => Promise<T> | T;

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
  | SsrLoaderFnFactory<T, Dependencies>
  | SsrRouteEntryObject<T, M, Dependencies>;

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
}
