import { getPluginApi } from "@real-router/core/api";

import { ERROR_PREFIX } from "./constants";

import type { RscActionResult } from "./types";
import type {
  DefaultDependencies,
  Plugin,
  PluginFactory,
} from "@real-router/types";

function describeBadResult(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (
    typeof value === "object" &&
    typeof (value as { then?: unknown }).then === "function"
  ) {
    return "Promise/thenable — wire your action result synchronously";
  }

  return typeof value;
}

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
  // Mirror the factory-time validation that `rscServerPluginFactory` and
  // `ssrDataPluginFactory` already perform on their loaders map: a TS-cast
  // bypass or a JS consumer can smuggle a non-function through, and the
  // failure would otherwise surface much later inside the start interceptor
  // as `TypeError: getResult is not a function`, after the `"rscAction"`
  // namespace has already been claimed and the start interceptor has been
  // registered. Failing eagerly with a typed, prefixed error keeps the API
  // consistent across all factories in this package.
  if (typeof getResult !== "function") {
    throw new TypeError(`${ERROR_PREFIX} getResult must be a function`);
  }

  return (router): Plugin => {
    const api = getPluginApi(router);
    const claim = api.claimContextNamespace("rscAction");

    const removeStartInterceptor = api.addInterceptor(
      "start",
      async (next, path) => {
        const state = await next(path);
        // Read as `unknown`: the TS contract pins it to RscActionResult, but
        // we run a defensive shape guard below for cast-bypassed garbage.
        const result: unknown = getResult();

        if (result === undefined) {
          return state;
        }

        // Symmetry-with-loaders runtime guard. The TS contract is
        // `() => RscActionResult | undefined`, but the most common consumer
        // mistake is wiring an `async` getResult — TS allows it via cast,
        // and the resulting Promise would land in `state.context.rscAction`
        // and break every downstream `result.returnValue` access. Reject
        // any non-plain-object up-front so the failure points back at the
        // call site instead of bubbling out of an unrelated render later.
        if (
          typeof result !== "object" ||
          result === null ||
          Array.isArray(result) ||
          typeof (result as { then?: unknown }).then === "function"
        ) {
          throw new TypeError(
            `${ERROR_PREFIX} getResult must return an RscActionResult object or undefined (got ${describeBadResult(result)})`,
          );
        }

        claim.write(state, result as RscActionResult<TReturn, TFormState>);

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
