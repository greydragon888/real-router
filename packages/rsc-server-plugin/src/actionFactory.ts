import { getPluginApi } from "@real-router/core/api";

import { ERROR_PREFIX } from "./constants";

import type { RscActionResult } from "./types";
import type {
  DefaultDependencies,
  Plugin,
  PluginFactory,
} from "@real-router/core";

/**
 * Per-start runtime validator for `getResult()` return values.
 *
 * Returns `null` when the value is acceptable (typed `RscActionResult`,
 * non-thenable, non-array, non-null object). Otherwise returns a short
 * descriptor used in the thrown `TypeError` message — keeps the error
 * actionable by pointing at the exact failure mode (`"null"`, `"array"`,
 * `"Promise/thenable — wire your action result synchronously"`, or the
 * raw `typeof` for primitives).
 *
 * Single source of truth for the two-decision pattern: "throw or
 * accept" + "what to say in the error". Previously the same checks
 * lived inline at the call site AND in `describeBadResult` — a typo in
 * one would silently break the symmetry. Unifying as one classifier
 * eliminates that drift class.
 */
function classifyRscActionResult(value: unknown): string | null {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value !== "object") {
    return typeof value;
  }
  if (typeof (value as { then?: unknown }).then === "function") {
    return "Promise/thenable — wire your action result synchronously";
  }

  return null;
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
 * `RscActionResult` is plain JSON (no ReactNode), so `serializeRouterState(state)`
 * includes it without needing `excludeContext` — but that JSON copy is for
 * **server-side inspection / logging**, not a client transport path.
 * `hydrateRouter` restores only the `state.context` namespaces written by a
 * claim writer, and this plugin's client side never reads the hydration
 * scratchpad, so a serialized `rscAction` **evaporates on hydration**
 * (`hydrated.context.rscAction === undefined`). The canonical way the action
 * result reaches the client is the **Flight payload**: `buildRscPayload(state)`
 * folds `rscAction.returnValue` / `formState` into the RSC stream, where the
 * client reads them via React's `useActionState`. Pass
 * `excludeContext: ["rsc", "rscAction"]` to keep it out of the JSON entirely
 * (e.g. the result carries server-only secrets).
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
        // and break every downstream `result.returnValue` access. Single
        // classifier — `classifyRscActionResult` is the source of truth for
        // BOTH the accept/reject decision AND the error description, so a
        // change to one cannot drift from the other.
        const badShape = classifyRscActionResult(result);

        if (badShape !== null) {
          throw new TypeError(
            `${ERROR_PREFIX} getResult must return an RscActionResult object or undefined (got ${badShape})`,
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
