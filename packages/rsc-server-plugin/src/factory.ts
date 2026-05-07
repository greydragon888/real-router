import { ERROR_PREFIX } from "./constants";
import { createSsrLoaderPlugin } from "./shared-ssr";
import { validateLoaders } from "./validation";

import type { RscLoaderFactoryMap } from "./types";
import type { DefaultDependencies, PluginFactory } from "@real-router/types";
import type { ReactNode } from "react";

/**
 * Plugin factory that loads per-route `ReactNode` (RSC payload) by intercepting
 * `router.start()`. Variant B from the RSC integration RFC: the plugin stores a
 * `ReactNode` on `state.context.rsc` — it does NOT render Flight bytes itself.
 *
 * The caller is responsible for piping the published `ReactNode` through the
 * appropriate bundler-specific renderer (e.g.
 * `@vitejs/plugin-rsc/rsc.renderToReadableStream`,
 * `react-server-dom-webpack/server.edge`, etc.) — keeping this plugin fully
 * bundler-agnostic.
 *
 * Sibling plugin `@real-router/ssr-data-plugin` follows the same factory
 * pattern via `createSsrLoaderPlugin` from `shared/ssr/`.
 *
 * @example
 * ```ts
 * const router = cloneRouter(baseRouter);
 *
 * router.usePlugin(rscServerPluginFactory({
 *   "users.profile": () => async (params) => {
 *     const user = await db.users.findById(params.id);
 *     return <UserProfile user={user} />;
 *   },
 * }));
 *
 * const state = await router.start(req.url);
 * if (state.context.rsc) {
 *   const flight = renderToReadableStream(state.context.rsc);
 *   // pipe flight to HTTP response
 * }
 * ```
 */
export function rscServerPluginFactory<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(loaders: RscLoaderFactoryMap<Dependencies>): PluginFactory<Dependencies> {
  validateLoaders(loaders);

  return createSsrLoaderPlugin<ReactNode, Dependencies>(loaders, {
    namespace: "rsc",
    modeNamespace: "ssrRscMode",
    errorPrefix: ERROR_PREFIX,
    allowedModes: ["full", "client-only"],
  });
}
