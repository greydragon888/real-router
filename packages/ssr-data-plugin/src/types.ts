import type {
  SsrLoaderFn,
  SsrLoaderFnFactory,
  SsrLoaderTarget,
  SsrMode,
  SsrRouteEntry,
} from "./shared-ssr";
import type { DefaultDependencies } from "@real-router/core";

export type DataLoaderFn = SsrLoaderFn<unknown>;

/** Destination channels handed to a data loader — `{ params, search }` (RFC-4 M2 / #1548). */
export type DataLoaderTarget = SsrLoaderTarget;

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
> = SsrLoaderFnFactory<unknown, Dependencies>;

/**
 * Per-route entry: either a loader factory (short form) or
 * `{ ssr?, loader? }` object form. Mode defaults to "full".
 *
 * - `ssr: "full"` (default) — server runs the loader, mode marker `state.context.ssrDataMode = "full"`.
 * - `ssr: "data-only"` — server runs the loader, mode marker `"data-only"`. App may render shell-only HTML.
 * - `ssr: "client-only"` (or `false`) — loader is skipped on every `start()`. App handles client-side fetching.
 * - `ssr: true` — alias for "full".
 * - `ssr: (state) => SsrMode` — resolved per-navigation, **before** the mode is written to context.
 */
export type DataRouteEntry<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = SsrRouteEntry<unknown, SsrMode, Dependencies>;

export type DataLoaderFactoryMap<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = Record<string, DataRouteEntry<Dependencies>>;

export { type SsrLoaderContext, type SsrMode } from "./shared-ssr";
