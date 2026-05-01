import type { DefaultDependencies, Params, Router } from "@real-router/types";
import type { ReactNode } from "react";

/**
 * Compiled RSC loader signature.
 *
 * Receives the resolved route's `params` and returns a `ReactNode` (a Server
 * Component element, sync or async). Synchronous return is permitted because
 * many Server Components are synchronous — wrapping them in `Promise.resolve`
 * would be ceremonial.
 */
export type RscLoaderFn = (params: Params) => Promise<ReactNode> | ReactNode;

/**
 * Factory function for creating RSC loaders.
 *
 * Receives the router instance and a dependency getter (same pattern as
 * `DataLoaderFnFactory`/`GuardFnFactory`). Factory runs once at
 * `usePlugin()` time; the returned loader is cached.
 *
 * @template Dependencies - Router dependency map for typed `getDependency()`.
 *   Defaults to `DefaultDependencies`. Pass your app's dependency interface
 *   for type-safe DI: `RscLoaderFnFactory<AppDependencies>`.
 */
export type RscLoaderFnFactory<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = (
  router: Router<Dependencies>,
  getDependency: <K extends keyof Dependencies>(key: K) => Dependencies[K],
) => RscLoaderFn;

/**
 * Map of route name → loader factory.
 *
 * Pass to `rscServerPluginFactory()`. Keys are route names (e.g. `"users.profile"`);
 * values are factories returning the compiled loader.
 */
export type RscLoaderFactoryMap<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = Record<string, RscLoaderFnFactory<Dependencies>>;
