import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { clearStale, isStale } from "./staleRegistry.js";
import { ALL_SSR_MODES } from "./types.js";

import type {
  SsrLoaderFactoryMap,
  SsrLoaderFn,
  SsrLoaderPluginConfig,
  SsrMode,
  SsrModeConfig,
} from "./types.js";
import type {
  ContextNamespaceClaim,
  DefaultDependencies,
  Plugin,
  PluginFactory,
  State,
} from "@real-router/types";

interface CompiledEntry<T> {
  mode: SsrModeConfig | undefined;
  loader: SsrLoaderFn<T> | undefined;
}

function rejectMode(
  value: unknown,
  allowed: readonly SsrMode[],
  prefix: string,
  route: string,
): never {
  throw new TypeError(
    `${prefix} mode "${String(value)}" is not allowed for route "${route}". Allowed: ${allowed.join(", ")}`,
  );
}

function resolveMode(
  ssr: SsrModeConfig | undefined,
  state: State,
  allowed: readonly SsrMode[],
  prefix: string,
  route: string,
): SsrMode {
  if (ssr === undefined || ssr === true) return "full";

  if (ssr === false) {
    if (!allowed.includes("client-only")) {
      rejectMode("client-only", allowed, prefix, route);
    }

    return "client-only";
  }

  const value = typeof ssr === "function" ? ssr(state) : ssr;

  if (typeof value !== "string" || !allowed.includes(value as SsrMode)) {
    rejectMode(value, allowed, prefix, route);
  }

  return value;
}

export function createSsrLoaderPlugin<
  T,
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  loaders: SsrLoaderFactoryMap<T, SsrMode, Dependencies>,
  config: SsrLoaderPluginConfig,
): PluginFactory<Dependencies> {
  return (router, getDependency): Plugin => {
    const api = getPluginApi(router);
    const allowed = config.allowedModes ?? ALL_SSR_MODES;

    const dataClaim = api.claimContextNamespace(config.namespace);

    let modeClaim: ContextNamespaceClaim;

    try {
      modeClaim = api.claimContextNamespace(config.modeNamespace);
    } catch (error) {
      dataClaim.release();

      throw error;
    }

    const compiled = new Map<string, CompiledEntry<T>>();

    try {
      for (const [name, raw] of Object.entries(loaders)) {
        const obj = typeof raw === "function" ? { loader: raw } : raw;

        let loader: SsrLoaderFn<T> | undefined;

        if (obj.loader !== undefined) {
          const fn = obj.loader(router, getDependency);

          if (typeof fn !== "function") {
            throw new TypeError(
              `${config.errorPrefix} factory for route "${name}" must return a function`,
            );
          }

          loader = fn;
        }

        compiled.set(name, { mode: obj.ssr, loader });
      }
    } catch (error) {
      dataClaim.release();
      modeClaim.release();

      throw error;
    }

    const internals = getInternals(router);

    const removeStartInterceptor = api.addInterceptor(
      "start",
      async (next, path) => {
        const state = await next(path);
        const entry = compiled.get(state.name);

        if (!entry) return state;

        const mode = resolveMode(
          entry.mode,
          state,
          allowed,
          config.errorPrefix,
          state.name,
        );

        modeClaim.write(state, mode);

        if (mode === "client-only") return state;

        const hydrationState = internals.hydrationState;

        if (
          hydrationState !== null &&
          hydrationState.name === state.name &&
          config.namespace in hydrationState.context
        ) {
          dataClaim.write(state, hydrationState.context[config.namespace] as T);
        } else if (entry.loader !== undefined) {
          dataClaim.write(state, await entry.loader(state.params));
        }

        return state;
      },
    );

    // CSR revalidation channel for `invalidate(router, namespace)`.
    // Runs in the awaited LEAVE_APPROVE phase so fresh data lands on
    // `nextRoute.context` before `TRANSITION_SUCCESS` fires.
    // Flag is cleared only after a successful, non-cancelled loader write —
    // no-entry / client-only / cancelled navigations preserve it for retry.
    const removeLeaveListener = router.subscribeLeave(
      async ({ nextRoute, signal }) => {
        if (!isStale(router, config.namespace)) return;

        const entry = compiled.get(nextRoute.name);

        if (!entry) return;

        const mode = resolveMode(
          entry.mode,
          nextRoute,
          allowed,
          config.errorPrefix,
          nextRoute.name,
        );

        modeClaim.write(nextRoute, mode);

        if (mode === "client-only" || entry.loader === undefined) return;

        // Pass the navigation's signal so cancellation-aware loaders can
        // abort their in-flight work (fetch, DB query, etc.) when a newer
        // navigation supersedes this one. The post-await `signal.aborted`
        // check below remains as the final gate — loaders that ignore the
        // signal still benefit from the cancel-safety contract (#605).
        const data = await entry.loader(nextRoute.params, { signal });

        if (signal.aborted) return;

        clearStale(router, config.namespace);
        dataClaim.write(nextRoute, data);
      },
    );

    return {
      teardown() {
        removeStartInterceptor();
        removeLeaveListener();
        dataClaim.release();
        modeClaim.release();
      },
    };
  };
}
