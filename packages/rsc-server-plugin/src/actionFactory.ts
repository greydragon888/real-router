import { getPluginApi } from "@real-router/core/api";

import type { RscActionResult } from "./types";
import type {
  DefaultDependencies,
  Plugin,
  PluginFactory,
} from "@real-router/types";

/**
 * Plugin factory that publishes a Server Action result to
 * `state.context.rscAction`. Pair with `rscServerPluginFactory` —
 * the `"rsc"` and `"rscAction"` namespaces are independent and the
 * two plugins coexist on the same router.
 *
 * The factory takes a `getResult` resolver evaluated at start-time
 * (inside the `start` interceptor, after the route resolves but
 * before the caller reads `state`). The caller has the action result
 * in scope (e.g. computed by `decodeAction` + `loadServerAction` in
 * their fetch handler) and returns it from the closure:
 *
 * @example
 * ```ts
 * let actionResult: RscActionResult | undefined;
 *
 * if (request.method === "POST") {
 *   const decoded = await decodeAction(formData);
 *   actionResult = { returnValue: { ok: true, data: await decoded() } };
 * }
 *
 * router.usePlugin(
 *   rscServerPluginFactory(loaders),
 *   rscActionPluginFactory(() => actionResult),
 * );
 *
 * const state = await router.start(pathname);
 * // state.context.rscAction === actionResult (or undefined)
 * ```
 *
 * When `getResult()` returns `undefined`, the interceptor skips the
 * write — `state.context.rscAction` stays `undefined`. Useful for
 * GET requests where there's no action to surface.
 *
 * The result is JSON-friendly (no ReactNode), so it serializes via
 * `serializeRouterState(state)` without needing `excludeContext`.
 * If you want to keep it server-side only (e.g. action result
 * contains secrets), pass `excludeContext: ["rsc", "rscAction"]`.
 */
export function rscActionPluginFactory<
  TReturn = unknown,
  TFormState = unknown,
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  getResult: () => RscActionResult<TReturn, TFormState> | undefined,
): PluginFactory<Dependencies> {
  return (router): Plugin => {
    const api = getPluginApi(router);
    const claim = api.claimContextNamespace("rscAction");

    const removeStartInterceptor = api.addInterceptor(
      "start",
      async (next, path) => {
        const state = await next(path);
        const result = getResult();

        if (result !== undefined) {
          claim.write(state, result);
        }

        return state;
      },
    );

    return {
      teardown() {
        removeStartInterceptor();
        claim.release();
      },
    };
  };
}
