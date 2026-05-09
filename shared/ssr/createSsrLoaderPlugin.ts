import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { isDeferred } from "./defer.js";
import { ensureRegistryPromise } from "./deferRegistry.js";
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

interface CompiledDeferred {
  promises: Record<string, Promise<unknown>>;
  keys: string[];
}

function processLoaderResult<T>(
  result: T,
  hasDeferredSupport: boolean,
): { critical: T; deferred: CompiledDeferred | null } {
  if (hasDeferredSupport && isDeferred(result)) {
    return {
      critical: result.critical as T,
      deferred: {
        promises: result.deferred,
        keys: Object.keys(result.deferred),
      },
    };
  }

  return { critical: result, deferred: null };
}

export function createSsrLoaderPlugin<
  T,
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  loaders: SsrLoaderFactoryMap<T, SsrMode, Dependencies>,
  config: SsrLoaderPluginConfig,
): PluginFactory<Dependencies> {
  const hasDeferredSupport =
    config.deferredNamespace !== undefined &&
    config.deferredKeysNamespace !== undefined;

  if (
    (config.deferredNamespace !== undefined) !==
    (config.deferredKeysNamespace !== undefined)
  ) {
    throw new TypeError(
      `${config.errorPrefix} \`deferredNamespace\` and \`deferredKeysNamespace\` must be set together`,
    );
  }

  return (router, getDependency): Plugin => {
    const api = getPluginApi(router);
    const allowed = config.allowedModes ?? ALL_SSR_MODES;

    const dataClaim = api.claimContextNamespace(config.namespace);

    let modeClaim: ContextNamespaceClaim;
    let deferredClaim: ContextNamespaceClaim | null = null;
    let deferredKeysClaim: ContextNamespaceClaim | null = null;

    try {
      modeClaim = api.claimContextNamespace(config.modeNamespace);
    } catch (error) {
      dataClaim.release();

      throw error;
    }

    if (hasDeferredSupport) {
      try {
        deferredClaim = api.claimContextNamespace(config.deferredNamespace!);
      } catch (error) {
        dataClaim.release();
        modeClaim.release();

        throw error;
      }

      try {
        deferredKeysClaim = api.claimContextNamespace(
          config.deferredKeysNamespace!,
        );
      } catch (error) {
        dataClaim.release();
        modeClaim.release();
        deferredClaim.release();

        throw error;
      }
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
      deferredClaim?.release();
      deferredKeysClaim?.release();

      throw error;
    }

    const internals = getInternals(router);

    const writeLoaderResult = (state: State, value: T): void => {
      const processed = processLoaderResult(value, hasDeferredSupport);

      dataClaim.write(state, processed.critical);

      if (processed.deferred !== null && deferredClaim && deferredKeysClaim) {
        deferredClaim.write(state, processed.deferred.promises);
        deferredKeysClaim.write(state, processed.deferred.keys);
      }
    };

    const reconstructDeferredFromHydration = (
      state: State,
      hydrated: Record<string, unknown>,
    ): void => {
      if (!hasDeferredSupport || !deferredClaim || !deferredKeysClaim) return;

      const keysRaw = hydrated[config.deferredKeysNamespace!];

      if (!Array.isArray(keysRaw)) return;

      const keys = keysRaw.filter(
        (k): k is string =>
          typeof k === "string" &&
          // Defensive: drop reserved keys that would corrupt the prototype
          // chain when assigned via `[key] = …`. `{ __proto__: x }` literal
          // does the same thing and would trigger the setter on the fresh
          // object below — turning useDeferred("then") into a function ref
          // pulled from Promise.prototype. With a null-prototype object
          // (below) `__proto__` is just a property, but skipping these
          // keys outright keeps the surface predictable.
          k !== "__proto__" &&
          k !== "constructor" &&
          k !== "prototype",
      );

      if (keys.length === 0) return;

      // Null-prototype object so `[key] = …` cannot trigger the
      // `Object.prototype.__proto__` setter, even if the filter above is
      // bypassed by future refactors.
      const promises = Object.create(null) as Record<
        string,
        Promise<unknown>
      >;

      for (const key of keys) {
        promises[key] = ensureRegistryPromise(key);
      }

      deferredClaim.write(state, promises);
      deferredKeysClaim.write(state, keys);
    };

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
          reconstructDeferredFromHydration(state, hydrationState.context);
        } else if (entry.loader !== undefined) {
          writeLoaderResult(state, await entry.loader(state.params));
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
        writeLoaderResult(nextRoute, data);
      },
    );

    return {
      teardown() {
        removeStartInterceptor();
        removeLeaveListener();
        dataClaim.release();
        modeClaim.release();
        deferredClaim?.release();
        deferredKeysClaim?.release();
      },
    };
  };
}
