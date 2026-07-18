import type {
  SsrLoaderFn,
  SsrLoaderFnFactory,
  SsrMode,
  SsrRouteEntry,
} from "./shared-ssr";
import type { DefaultDependencies } from "@real-router/core";
import type { ReactNode } from "react";

export { type SsrLoaderContext } from "./shared-ssr";

/**
 * SSR mode subset supported by `rsc-server-plugin`.
 *
 * `"data-only"` is intentionally excluded — RSC has no concept of "data
 * without component" (the Flight payload IS the data + component). Using
 * `"data-only"` with `rscServerPluginFactory` is a configuration error and
 * is rejected at factory time.
 */
export type RscSsrMode = Exclude<SsrMode, "data-only">;

/**
 * Compiled RSC loader signature.
 *
 * Receives the resolved route's `params` and returns a `ReactNode` (a Server
 * Component element, sync or async). Synchronous return is permitted because
 * many Server Components are synchronous — wrapping them in `Promise.resolve`
 * would be ceremonial.
 */
export type RscLoaderFn = SsrLoaderFn<ReactNode>;

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
> = SsrLoaderFnFactory<ReactNode, Dependencies>;

/**
 * Per-route entry: either a loader factory (short form) or
 * `{ ssr?, loader? }` object form. Mode defaults to `"full"`.
 *
 * Allowed `ssr` values for RSC: `"full"` | `"client-only"` (and the
 * `true` / `false` aliases). `"data-only"` is rejected at factory time.
 *
 * Function form `(state) => RscSsrMode` is resolved per-navigation,
 * **before** the mode is written to context.
 */
export type RscRouteEntry<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = SsrRouteEntry<ReactNode, RscSsrMode, Dependencies>;

/**
 * Map of route name → entry (factory or `{ ssr?, loader? }`).
 *
 * Pass to `rscServerPluginFactory()`. Keys are route names (e.g. `"users.profile"`);
 * values are factory or object-form route entries.
 */
export type RscLoaderFactoryMap<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = Record<string, RscRouteEntry<Dependencies>>;

/**
 * Server Action result published by `rscActionPluginFactory` to
 * `state.context.rscAction`. Consumers read either field at render
 * time. Both are optional — typical flows write one or the other:
 *
 * - `returnValue` — set when the action was invoked via the hydrated
 *   client path (`setServerCallback` → `loadServerAction` →
 *   `decodeReply` in the RSC entry). Threaded back into
 *   `useActionState` on the client.
 * - `formState` — set when the action was invoked via progressive
 *   enhancement (`<form action={fn}>` POST without JS) and decoded
 *   via `decodeAction(formData)` + `decodeFormState(result, formData)`.
 *
 * Both type parameters default to `unknown` to keep the plugin
 * runtime-only — consumers narrow them at the call site.
 */
export interface RscActionResult<TReturn = unknown, TFormState = unknown> {
  returnValue?: { ok: boolean; data: TReturn };
  formState?: TFormState;
}

/**
 * Canonical Flight payload shape for RSC apps that ship Server Actions.
 *
 * The pipeline serializes this object via the bundler's RSC stream
 * renderer (e.g. `@vitejs/plugin-rsc/rsc.renderToReadableStream`); the
 * SSR + browser entries deserialize the same shape and thread
 * `returnValue`/`formState` into `useActionState`.
 *
 * Apps without Server Actions can use `RscPayload` with all generics
 * defaulted, or just type their payload as `{ root: ReactNode }`.
 *
 * Type parameters:
 * - `TReturn` — narrowed shape of `returnValue.data` (e.g. mutation
 *   confirmation). Defaults to `unknown`.
 * - `TFormState` — narrowed shape of `formState`. Defaults to
 *   `unknown` so the plugin stays free of `react-dom/client` import
 *   (which carries the canonical `ReactFormState` type). Consumers
 *   narrow at call site:
 *
 *   ```ts
 *   import type { ReactFormState } from "react-dom/client";
 *   type AppPayload = RscPayload<{ id: string }, ReactFormState>;
 *   ```
 */
export interface RscPayload<
  TReturn = unknown,
  TFormState = unknown,
> extends RscActionResult<TReturn, TFormState> {
  /** Server Component tree to render. */
  root: ReactNode;
}
