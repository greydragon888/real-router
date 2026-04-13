import type { DefaultDependencies, Params, Router } from "@real-router/types";

export type DataLoaderFn = (params: Params) => Promise<unknown>;

/**
 * Factory function for creating data loaders.
 * Receives the router instance and a dependency getter (same pattern as GuardFnFactory).
 * Factory runs once when the plugin starts; the returned loader is cached.
 *
 * @template Dependencies - Router dependency map for typed `getDependency()` access.
 *   Defaults to `DefaultDependencies`. Pass your app's dependency interface for
 *   type-safe DI: `DataLoaderFnFactory<AppDependencies>`.
 */
export type DataLoaderFnFactory<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = (
  router: Router<Dependencies>,
  getDependency: <K extends keyof Dependencies>(key: K) => Dependencies[K],
) => DataLoaderFn;

export type DataLoaderFactoryMap<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = Record<string, DataLoaderFnFactory<Dependencies>>;
