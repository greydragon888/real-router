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
import type {
  ContextNamespaceClaim,
  DefaultDependencies,
  Plugin,
  PluginFactory,
  State,
} from "@real-router/core";
import type { Router } from "@real-router/core/types";

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — they answer "what is on this object" for a value this module
 * did not build. Read off the live global they can be re-pointed after boot, and
 * `shared/` is the half where that fails OPEN: measured in `browser-env`, a
 * re-pointed `getPrototypeOf` admits a `Date` into `state.params` and a
 * re-pointed `keys` skips option validation entirely.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it (#1798).
 */
const objectKeys = Object.keys;
const objectEntries = Object.entries;
const hasOwn = Object.hasOwn;

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
 * caller-provided `router` + `getDependency` arguments.
 *
 * ⚑ Own keys on BOTH axes (#1835). `Object.entries` walks the route map, and
 * `hasOwn` gates each entry's `loader` / `ssr`. Both halves are load-bearing:
 * enumerating the map by own key says nothing about how a field is read off an
 * entry, and a member read dispatches into the chain.
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

  for (const [name, raw] of objectEntries(loaders)) {
    const obj = typeof raw === "function" ? { loader: raw } : raw;

    let loader: SsrLoaderFn<T> | undefined;

    // ⚑ Own key, not a member read (#1835). `obj` is either the caller's own
    // config object or — for the short form — a fresh literal whose prototype
    // is `Object.prototype`; both dispatch `obj.loader` into the chain, and the
    // validator's unexpected-key loop enumerates OWN keys, so an inherited
    // `loader` passes the check and then supplies the route's loader.
    if (hasOwn(obj, "loader") && obj.loader !== undefined) {
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

    // Own key for the same reason as `loader` above (#1835). The short form is
    // the sharper half: its `obj` is a literal this function just built, so an
    // inherited `ssr` is read off an object the caller never supplied.
    const ssr = hasOwn(obj, "ssr") ? obj.ssr : undefined;

    if (typeof ssr === "function") {
      modeFn = ssr;
    } else {
      // Static — undefined/true/false/string. Pass a synthetic state;
      // resolveMode ignores `state` for non-function forms.
      staticMode = resolveMode(
        ssr,
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
  if (ssr === undefined || ssr === true) {
    return "full";
  }

  // `ssr: false` always means client-only. Both consumers of this factory
  // (ssr-data-plugin: all modes; rsc-server-plugin: ["full", "client-only"])
  // permit client-only, so there is no reachable config that would reject it
  // here — the former defensive `if (!allowed.includes("client-only")) reject`
  // was dead code (verified by union coverage across both plugins, #809).
  if (ssr === false) {
    return "client-only";
  }

  // ⚠ Read through an `unknown` view: `SsrModeResolver<M> = (state) => M` says a
  // resolver returns a string, and that type binds TypeScript callers and nobody
  // else. Typed as declared, both checks below read as impossible — which is
  // precisely the type this distrusts.
  const value: unknown = typeof ssr === "function" ? ssr(state) : ssr;

  // ⚑ Reachable only from a resolver (#1918): the static booleans returned two
  // branches up, so a boolean here came out of a call. The refusal is what the
  // type contracts; the message is what was missing — `ssr: false` works and
  // `ssr: () => false` does not, and the reader had to infer why from a list of
  // allowed strings that never mentioned the static slot.
  if (typeof value === "boolean") {
    throw new TypeError(
      `${prefix} the \`ssr\` resolver for route "${route}" returned ${value}. A resolver must return an SsrMode string (${allowed.join(", ")}); booleans are a shorthand for the static slot — write \`ssr: ${value}\` instead.`,
    );
  }

  if (
    typeof value !== "string" ||
    !(allowed as readonly string[]).includes(value)
  ) {
    rejectMode(value, allowed, prefix, route);
  }

  return value as SsrMode;
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
      const handle = api.claimContextNamespace(namespace);

      acquired.push(handle);

      return handle;
    };
    const rollback = (): void => {
      for (const held of acquired) {
        held.release();
      }
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
      if (isDeferred(value) && deferredClaims === null) {
        throw new TypeError(
          `${config.errorPrefix} the loader for route "${state.name}" returned a defer() payload, but this plugin has no deferred channel`,
        );
      }

      if (deferredClaims !== null && isDeferred(value)) {
        // ⚑ The shape is checked before the first write, so a rejection here
        // leaves no partial write behind (#1835). `isDeferred` answers on the
        // brand alone, and this branch commits to three claims — ordering the
        // check ahead of them is what makes the three atomic.
        // ⚠ Same widening as the hydration branch: `isDeferred` answers on the
        // BRAND, so the declared `deferred` object is a promise the type makes
        // and the value need not keep.
        const deferred: unknown = value.deferred;

        if (typeof deferred !== "object" || deferred === null) {
          throw new TypeError(
            `${config.errorPrefix} deferred payload for route "${state.name}" must carry a \`deferred\` object`,
          );
        }

        const keys = objectKeys(deferred);

        dataClaim.write(state, value.critical);
        deferredClaims.value.write(state, value.deferred);
        deferredClaims.keys.write(state, keys);

        return;
      }

      dataClaim.write(state, value);
    };

    const reconstructDeferredFromHydration = (
      state: State,
      hydrated: Record<string, unknown>,
    ): void => {
      if (deferredConfig === null || deferredClaims === null) {
        return;
      }

      // ⚑ Own key (#1835). The scratchpad comes from `JSON.parse`, so its
      // prototype is `Object.prototype`, and the keys namespace is a
      // developer-chosen string — an inherited array passes `Array.isArray`
      // and reconstructs promises the server never sent.
      if (!hasOwn(hydrated, deferredConfig.keysNamespace)) {
        return;
      }

      const keysRaw = hydrated[deferredConfig.keysNamespace];

      if (!Array.isArray(keysRaw)) {
        return;
      }

      const keys = keysRaw.filter(
        (key): key is string =>
          typeof key === "string" &&
          // Defensive: drop reserved keys that would corrupt the prototype
          // chain when assigned via `[key] = …`. `{ __proto__: x }` literal
          // does the same thing and would trigger the setter on the fresh
          // object below — turning useDeferred("then") into a function ref
          // pulled from Promise.prototype. With a null-prototype object
          // (below) `__proto__` is just a property, but skipping these
          // keys outright keeps the surface predictable.
          key !== "__proto__" &&
          key !== "constructor" &&
          key !== "prototype",
      );

      if (keys.length === 0) {
        return;
      }

      // Null-prototype object so `[key] = …` cannot trigger the
      // `Object.prototype.__proto__` setter, even if the filter above is
      // bypassed by future refactors.
      const promises = Object.create(null) as Record<string, Promise<unknown>>;

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

      if (!entry) {
        return null;
      }

      // Static forms (the common case) — staticMode was pre-resolved at
      // compile time, skip the resolveMode if/else walk per navigation.
      // Function-form path: invoke modeFn with the resolved state and
      // re-validate via resolveMode (catches a resolver returning a
      // foreign string at runtime).
      const mode =
        entry.staticMode ??
        resolveMode(
          entry.modeFn,
          state,
          allowed,
          config.errorPrefix,
          state.name,
        );

      modeClaim.write(state, mode);

      if (mode === "client-only") {
        return null;
      }

      return entry;
    };

    const removeStartInterceptor = api.addInterceptor(
      "start",
      async (next, path) => {
        const state = await next(path);
        const entry = prepareEntry(state);

        if (entry === null) {
          return state;
        }

        const hydrationState = internals.hydrationState;

        // ⚠ Read through an `unknown` view, and the widening is load-bearing.
        // The declared type promises a present object; that type is a CAST —
        // `hydrateRouter` widens a `{ path: string }` object-source into
        // `SerializedRouterState` (#762) — so what arrives is whatever the
        // payload carried. Typed as declared, the two checks below read as "no
        // overlap" to the linter, which is precisely the type this distrusts.
        const hydrated: unknown = hydrationState?.context;

        if (
          hydrationState !== null &&
          hydrationState.name === state.name &&
          // ⚑ A non-null OBJECT — the whole class, not `undefined` alone
          // (#762, #1835). `null` is what a server emits for "no context", and
          // `Object.hasOwn` throws on it. This interceptor runs POST-COMMIT, so
          // a throw here leaves the router active over a half-populated context
          // while `hydrateRouter` rejects. Nothing that is not an object carries
          // a namespace for us, so everything else falls through to the loader —
          // the answer a missing context gets.
          typeof hydrated === "object" &&
          hydrated !== null &&
          // ⚑ `Object.hasOwn`, not `in` (#1838). The context arrives from
          // `JSON.parse`, so its prototype is `Object.prototype`, and the
          // namespace is a developer-chosen string core accepts as long as it is
          // non-empty. Measured on a parsed context: `"toString" in context` is
          // true, `hasOwn` is false, and the value is a FUNCTION — a plugin with
          // that namespace would read the native method as the server's answer.
          //
          // The documented rule is "scratchpad presence wins" — an own
          // `undefined` still counts as the server's answer and still skips the
          // loader. `hasOwn` keeps it exactly; `!== undefined` would not.
          hasOwn(hydrated, config.namespace)
        ) {
          const context = hydrated as Record<string, unknown>;

          dataClaim.write(state, context[config.namespace]);
          reconstructDeferredFromHydration(state, context);
        } else if (entry.loader !== undefined) {
          // Two-channel loader target (RFC-4 M2 / #1548): path in `params`,
          // query in `search`.
          writeLoaderResult(
            state,
            await entry.loader({ params: state.params, search: state.search }),
          );
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
        // ⚑ The mode marker is published on EVERY navigation, ahead of the
        // staleness gate (#1915). `getSsrDataMode`'s `?? "full"` fallback means
        // "this route has no plugin entry"; without a write here it also spoke
        // for routes that HAVE one, so a route declared `ssr: false` answered
        // `"full"` after any client navigation and the documented
        // `mode === "client-only"` branch never fired.
        //
        // This listener already ran on every navigation — it returned early one
        // line down — so the cost added is a `Map.get`, a `claim.write`, and,
        // for the function form only, the resolver call the docs already
        // describe as per-navigation.
        const entry = prepareEntry(nextRoute);

        if (!isStale(router, config.namespace)) {
          return;
        }

        if (entry?.loader === undefined) {
          return;
        }

        // Pass the navigation's signal so cancellation-aware loaders can
        // abort their in-flight work (fetch, DB query, etc.) when a newer
        // navigation supersedes this one. The post-await `signal.aborted`
        // check below remains as the final gate — loaders that ignore the
        // signal still benefit from the cancel-safety contract (#605).
        const data = await entry.loader(
          { params: nextRoute.params, search: nextRoute.search },
          { signal },
        );

        if (signal.aborted) {
          return;
        }

        // ⚑ Write first, then clear (#1916). The contract stated above this
        // listener is "cleared only after a successful, non-cancelled loader
        // write", and `writeLoaderResult` can throw — a branded payload with no
        // `deferred` bag, or one handed to a plugin with no deferred channel.
        // Clearing ahead of it consumed the retry for a refresh that never
        // happened: the navigation rejected, no data was written, and the next
        // navigation saw a clean flag and did not try again.
        writeLoaderResult(nextRoute, data);
        clearStale(router, config.namespace);
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
