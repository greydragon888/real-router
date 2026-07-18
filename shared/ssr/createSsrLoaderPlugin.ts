import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { isDeferred } from "./defer.js";
import { ensureRegistryPromise } from "./deferRegistryClient.js";
import { clearStale, isStale } from "./staleRegistry.js";
import { ALL_SSR_MODES } from "./types.js";

import type {
  SsrLoaderFactoryMap,
  SsrLoaderFn,
  SsrLoaderPluginConfig,
  SsrMode,
  SsrModeConfig,
} from "./types.js";
import type { ContextNamespaceClaim, DefaultDependencies, Plugin, PluginFactory, State } from "@real-router/core";
import type { Router } from "@real-router/core/types";

interface CompiledEntry<T> {
  /**
   * Pre-resolved mode for static `ssr` configs (undefined / boolean /
   * string). `null` marker means "function-form resolver — must call
   * `resolveMode(modeFn, state, …)` at navigation time". Pre-computing
   * skips the `resolveMode` walk on every `start()` + every stale-flag
   * leave handler invocation for the common static-config case.
   */
  staticMode: SsrMode | null;
  /**
   * Function-form mode resolver. Defined ONLY when `obj.ssr` is a
   * function; `undefined` for static forms (where `staticMode` is
   * authoritative). Kept as a typed field rather than reusing the
   * raw `obj.ssr` so the prepareEntry call site avoids a `typeof`
   * branch per navigation.
   */
  modeFn: ((state: State) => SsrMode) | undefined;
  loader: SsrLoaderFn<T> | undefined;
}

/**
 * Compile a `SsrLoaderFactoryMap` into a `Map<name, CompiledEntry>`.
 *
 * Extracted from the inline `for (const [name, raw] of …)` body that lived
 * inside `createSsrLoaderPlugin` so the main function reads top-down:
 * claims are acquired, compilation runs against this helper, and any throw
 * bubbles to the shared `rollback()` path. Tested in isolation by the same
 * functional + property suites that pin the previous inline behaviour.
 *
 * The compile step is pure — it touches no router state other than via the
 * caller-provided `router` + `getDependency` arguments, and it only walks
 * own-enumerable entries (`Object.entries`) so prototype pollution stays
 * structurally impossible.
 *
 * Mode pre-resolution: static `ssr` forms (`undefined` / boolean / string)
 * are resolved here at compile time and cached as `staticMode`. The
 * runtime path in `prepareEntry` then reuses the cached value on every
 * `start()` + stale-flag leave handler invocation, skipping the
 * `resolveMode` if/else chain. Function-form `ssr` keeps a typed
 * `modeFn` for per-navigation evaluation.
 */
function compile<
  T,
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  loaders: SsrLoaderFactoryMap<T, SsrMode, Dependencies>,
  router: Router<Dependencies>,
  getDependency: <K extends keyof Dependencies>(key: K) => Dependencies[K],
  errorPrefix: string,
  allowed: readonly SsrMode[],
): Map<string, CompiledEntry<T>> {
  const compiled = new Map<string, CompiledEntry<T>>();

  for (const [name, raw] of Object.entries(loaders)) {
    const obj = typeof raw === "function" ? { loader: raw } : raw;

    let loader: SsrLoaderFn<T> | undefined;

    if (obj.loader !== undefined) {
      const fn = obj.loader(router, getDependency);

      if (typeof fn !== "function") {
        throw new TypeError(
          `${errorPrefix} factory for route "${name}" must return a function`,
        );
      }

      loader = fn;
    }

    // Pre-resolve static modes; defer function-form to navigation-time.
    // The `resolveMode` runtime helper still validates function-form
    // returns AND any forms that the validator passed but createSsrLoaderPlugin's
    // narrower `allowedModes` rejects (consumer-specific allow-list).
    let staticMode: SsrMode | null = null;
    let modeFn: ((state: State) => SsrMode) | undefined;

    if (typeof obj.ssr === "function") {
      modeFn = obj.ssr;
    } else {
      // Static — undefined/true/false/string. Pass a synthetic state;
      // resolveMode ignores `state` for non-function forms.
      staticMode = resolveMode(
        obj.ssr,
        SYNTHETIC_STATE,
        allowed,
        errorPrefix,
        name,
      );
    }

    compiled.set(name, { staticMode, modeFn, loader });
  }

  return compiled;
}

// Placeholder state for compile-time static-mode resolution. The
// resolveMode function reads `state` only for the function-form branch,
// so any non-null reference works for the static branches. Kept module-
// level so all compile() calls share one allocation.
const SYNTHETIC_STATE = {
  name: "",
  params: {},
  path: "",
  transition: {
    phase: "activating",
    reason: "success",
    segments: { deactivated: [], activated: [], intersection: "" },
  },
  context: {},
} as unknown as State;

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

  // `ssr: false` always means client-only. Both consumers of this factory
  // (ssr-data-plugin: all modes; rsc-server-plugin: ["full", "client-only"])
  // permit client-only, so there is no reachable config that would reject it
  // here — the former defensive `if (!allowed.includes("client-only")) reject`
  // was dead code (verified by union coverage across both plugins, #809).
  if (ssr === false) return "client-only";

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
  if (
    (config.deferredNamespace !== undefined) !==
    (config.deferredKeysNamespace !== undefined)
  ) {
    throw new TypeError(
      `${config.errorPrefix} \`deferredNamespace\` and \`deferredKeysNamespace\` must be set together`,
    );
  }

  // Bundle the two namespace strings into a single nullable object so
  // downstream code narrows via `if (deferredConfig !== null)` instead
  // of the `config.deferredNamespace!` non-null assertion that TS can't
  // derive from the XOR check above.
  const deferredConfig =
    config.deferredNamespace !== undefined &&
    config.deferredKeysNamespace !== undefined
      ? {
          valueNamespace: config.deferredNamespace,
          keysNamespace: config.deferredKeysNamespace,
        }
      : null;

  return (router, getDependency): Plugin => {
    const api = getPluginApi(router);
    const allowed = config.allowedModes ?? ALL_SSR_MODES;

    // Sequential claim acquisition with all-or-nothing rollback. Any
    // failure (collision, validation error during compile loop) releases
    // every claim acquired so far and rethrows. This replaces the
    // previous 4 nested try/catch blocks with progressively-longer
    // release lists — same semantics, one shared rollback path.
    const acquired: ContextNamespaceClaim[] = [];
    const claim = (namespace: string): ContextNamespaceClaim => {
      const c = api.claimContextNamespace(namespace);
      acquired.push(c);
      return c;
    };
    const rollback = (): void => {
      for (const c of acquired) c.release();
    };

    let dataClaim: ContextNamespaceClaim;
    let modeClaim: ContextNamespaceClaim;
    let deferredClaims: {
      value: ContextNamespaceClaim;
      keys: ContextNamespaceClaim;
    } | null = null;
    let compiled: Map<string, CompiledEntry<T>>;

    try {
      dataClaim = claim(config.namespace);
      modeClaim = claim(config.modeNamespace);

      if (deferredConfig !== null) {
        deferredClaims = {
          value: claim(deferredConfig.valueNamespace),
          keys: claim(deferredConfig.keysNamespace),
        };
      }

      compiled = compile(
        loaders,
        router,
        getDependency,
        config.errorPrefix,
        allowed,
      );
    } catch (error) {
      rollback();

      throw error;
    }

    const internals = getInternals(router);

    // Hot path on every successful start() / subscribeLeave refresh. The
    // previous shape ran a `processLoaderResult` helper that always allocated
    // a `{ critical, deferred }` wrapper object — wasted on the common
    // plain-data path (and on every call from `rsc-server-plugin`, which
    // never opts into deferred support). Inlining the branch keeps the
    // fast path allocation-free and the slow path (defer payload) at one
    // intentional `Object.keys(...)` array allocation per loader.
    const writeLoaderResult = (state: State, value: T): void => {
      if (deferredClaims !== null && isDeferred(value)) {
        dataClaim.write(state, value.critical as T);
        deferredClaims.value.write(state, value.deferred);
        deferredClaims.keys.write(state, Object.keys(value.deferred));

        return;
      }

      dataClaim.write(state, value);
    };

    const reconstructDeferredFromHydration = (
      state: State,
      hydrated: Record<string, unknown>,
    ): void => {
      if (deferredConfig === null || deferredClaims === null) return;

      const keysRaw = hydrated[deferredConfig.keysNamespace];

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

      deferredClaims.value.write(state, promises);
      deferredClaims.keys.write(state, keys);
    };

    // Shared between start interceptor (SSR boot path) and subscribeLeave
    // handler (CSR revalidation path). Returns the compiled entry only
    // when:
    //   1. the route is registered in this plugin's loaders map, AND
    //   2. the resolved mode is NOT "client-only".
    // In both successful cases the mode marker is published to
    // `state.context[modeNamespace]` BEFORE returning. Callers then own
    // the loader-invocation strategy (start path also checks the hydration
    // scratchpad; leave path gates on `entry.loader !== undefined`).
    const prepareEntry = (state: State): CompiledEntry<T> | null => {
      const entry = compiled.get(state.name);

      if (!entry) return null;

      // Static forms (the common case) — staticMode was pre-resolved at
      // compile time, skip the resolveMode if/else walk per navigation.
      // Function-form path: invoke modeFn with the resolved state and
      // re-validate via resolveMode (catches a resolver returning a
      // foreign string at runtime).
      const mode =
        entry.staticMode !== null
          ? entry.staticMode
          : resolveMode(
              entry.modeFn,
              state,
              allowed,
              config.errorPrefix,
              state.name,
            );

      modeClaim.write(state, mode);

      if (mode === "client-only") return null;

      return entry;
    };

    const removeStartInterceptor = api.addInterceptor(
      "start",
      async (next, path) => {
        const state = await next(path);
        const entry = prepareEntry(state);

        if (entry === null) return state;

        const hydrationState = internals.hydrationState;

        if (
          hydrationState !== null &&
          hydrationState.name === state.name &&
          // A hand-built partial source (`{ name, path }` with no `context`) is
          // type-legal via hydrateRouter's `{ path: string }` object-source
          // cast to SerializedRouterState — guard so the `in` below can't throw
          // `Cannot use 'in' operator … in undefined` (#762). A missing context
          // means "no server value for this namespace" → fall through to the loader.
          hydrationState.context !== undefined &&
          // `in` — not `!== undefined` — is intentional. The contract is
          // "scratchpad presence wins": if the server explicitly serialised
          // a value into this namespace (even an `undefined` left over from
          // a programmatic state object), the plugin treats that as the
          // server's authoritative answer and skips re-running the loader
          // on the client. JSON-roundtrip strips `undefined` values, so in
          // practice this only matters for in-memory hydration paths —
          // see CLAUDE.md "Gotchas → Hydration scratchpad: presence wins".
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

        const entry = prepareEntry(nextRoute);

        if (entry === null || entry.loader === undefined) return;

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
        deferredClaims?.value.release();
        deferredClaims?.keys.release();
      },
    };
  };
}
