import { errorCodes } from "../constants";
import { routeTreeToDefinitions } from "../engine";
import { getInternals } from "../internals";
import { getLifecycleApi } from "./getLifecycleApi";
import { assignConfigEntries } from "../namespaces/RoutesNamespace/helpers";
import { Router as RouterClass } from "../Router";
import { RouterError } from "../RouterError";

import type {
  DefaultDependencies,
  LoggerConfig,
  Router,
  Route,
} from "../types";

/**
 * Per-clone overrides beyond dependencies.
 */
export interface CloneOptions {
  /**
   * Per-clone logger config override, merged **over** the base router's resolved
   * logger config. Primary use: per-request `traceId` in SSR — a fresh
   * `callback` closed over the request id, while `level` inherits the base.
   * Omitted keys inherit the base (level / callback / callbackIgnoresLevel).
   *
   * Override is by **config**, not a logger instance: `RouterLogger` is
   * core-internal (only its `{ log, warn, error }` interface is public), so
   * nothing outside core constructs one — configuration is the whole surface.
   */
  logger?: Partial<LoggerConfig>;
}

/**
 * Build an independent router instance that shares the route tree, options,
 * lifecycle guards, and plugin factories of `router`. The primary use case
 * is **SSR multi-tenancy** — one base router per process, one clone per
 * request.
 *
 * @param router - Source router (must not be disposed).
 * @param dependencies - Optional per-clone overrides merged on top of the
 *   base router's dependencies. Always **fresh per call** in the documented
 *   SSR pattern: pass per-request state here, never store it in the base.
 *
 * @remarks
 *
 * **Dependency merge — shallow by design.** `base.dependencies` are spread
 * into the clone via `{ ...sourceDeps, ...dependencies }`. Top-level keys
 * are new objects, but **values are shared by reference**: a `Map`, `Set`,
 * class instance, function, or nested plain object stored in
 * `base.dependencies` is the **same instance** in every clone. Mutations
 * in one clone are visible in the base and in every sibling clone.
 *
 * This is intentional. `structuredClone` of dep values is **not** applied
 * because it would:
 * - strip class prototypes (`new DbClient()` → plain object, methods lost)
 * - reject functions and symbols (`DataCloneError`)
 * - fragment singleton pools (one connection pool per request — pool
 *   semantics destroyed)
 * - reject circular references
 *
 * **SSR rule of thumb.** Place values in `base.dependencies` according to
 * their lifecycle:
 *
 * - **Singletons / shared services** → `base.dependencies`. Examples: DB
 *   client, connection pool, logger, config, feature-flag client. Process-
 *   wide pooling depends on sharing these by reference.
 * - **Per-request state** → the `dependencies` override parameter (or
 *   `createRequestScope`'s `deps` argument). Examples: `currentUser`,
 *   `traceId`, `sessionId`, `abortSignal`. The override is applied last,
 *   so it wins over base keys; pass a fresh object per call.
 *
 * Cross-request data leaks are **only possible** when per-request mutable
 * state is incorrectly placed in `base.dependencies`. The override slot is
 * the safe channel.
 *
 * @example
 * ```typescript
 * // Server boot — singletons only
 * const base = createRouter(routes, options, {
 *   db: new DbClient(dbUrl),
 *   logger,
 * });
 *
 * // Per request — fresh override per call
 * const clone = cloneRouter(base, {
 *   currentUser,
 *   traceId,
 * });
 * // clone.deps.db === base.deps.db  ✓ shared pool (intentional)
 * // clone.deps.currentUser          ✓ unique per request
 * ```
 *
 * @see createRequestScope — `@real-router/core/utils` SSR helper that
 *   wraps this function and injects `abortSignal` automatically.
 */
export function cloneRouter<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  router: Router<Dependencies>,
  dependencies?: Dependencies,
  opts?: CloneOptions,
): RouterClass<Dependencies> {
  const ctx = getInternals(router);

  if (ctx.isDisposed()) {
    throw new RouterError(errorCodes.ROUTER_DISPOSED);
  }

  ctx.validator?.dependencies.validateCloneArgs(dependencies);

  // Get source store directly
  const sourceStore = ctx.routeGetStore();
  const routes = routeTreeToDefinitions(sourceStore.tree);
  const routeConfig = sourceStore.config;
  const resolvedForwardMap = sourceStore.resolvedForwardMap;
  const routeCustomFields = sourceStore.routeCustomFields;

  const {
    options,
    dependencies: sourceDeps,
    pluginFactories,
    loggerConfig,
  } = ctx.getCloneState();
  // Origin-aware factory snapshot — definition guards are re-registered with
  // `isFromDefinition=true` on the clone so `replace()` can still strip them
  // via `clearDefinitionGuards()`. External guards take the public lifecycle
  // API path so they survive `replace()` symmetric with the base.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
  const sourceLifecycleNamespace = sourceStore.lifecycleNamespace!;
  const { definition: definitionFactories, external: externalFactories } =
    sourceLifecycleNamespace.getFactoriesByOrigin();

  const mergedDeps = {
    ...sourceDeps,
    ...dependencies,
  } as Dependencies;

  // The clone builds its OWN logger (isolation, #724) but INHERITS the base's
  // resolved config — frozen options don't carry `logger`, so without this the
  // clone would fall back to the default logger and lose the base's
  // callback/level (an M1 regression the singleton used to mask). A per-request
  // `opts.logger` override (e.g. a traceId-bound callback) merges on top.
  const clonedLoggerConfig: Partial<LoggerConfig> = opts?.logger
    ? { ...loggerConfig, ...opts.logger }
    : loggerConfig;

  const newRouter = new RouterClass<Dependencies>(
    routes as Route<Dependencies>[],
    { ...options, logger: clonedLoggerConfig },
    mergedDeps,
  );

  const newCtx = getInternals(newRouter);
  const newStore = newCtx.routeGetStore();
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
  const newLifecycleNamespace = newStore.lifecycleNamespace!;

  // Copy the source config + store-level maps BEFORE re-registering guards
  // (#1331 review): the definition-guard factories re-executed below must
  // observe the fully-built clone (encoders/decoders/defaultParams/custom
  // fields), mirroring the constructor where flushPendingGuards runs after the
  // store is complete. The five RouteConfig sub-maps go through a single
  // enumeration so a newly added config field is carried over automatically
  // (#965); resolvedForwardMap and routeCustomFields are store-level (not part
  // of RouteConfig) and stay explicit.
  assignConfigEntries(newStore.config, routeConfig);
  Object.assign(newStore.resolvedForwardMap, resolvedForwardMap);
  Object.assign(newStore.routeCustomFields, routeCustomFields);

  // #1175: carry the source rootPath. It lives in the store (not options/config),
  // and neither routeTreeToDefinitions nor getCloneState include it — so a clone
  // of a base configured with `setRootPath("/app")` would otherwise build/match
  // under "" and 404 every request of a sub-path SSR deployment. setRootPath
  // rebuilds the tree in place with the just-copied config; the rebuild is only
  // paid when a rootPath is actually set, and it runs before the definition-guard
  // factories below so they observe the fully-built clone (rootPath included).
  if (sourceStore.rootPath !== "") {
    newCtx.setRootPath(sourceStore.rootPath);
  }

  const [definitionDeactivate, definitionActivate] = definitionFactories;
  const [externalDeactivate, externalActivate] = externalFactories;

  for (const [name, handler] of Object.entries(definitionDeactivate)) {
    newLifecycleNamespace.addCanDeactivate(name, handler, true);
  }

  for (const [name, handler] of Object.entries(definitionActivate)) {
    newLifecycleNamespace.addCanActivate(name, handler, true);
  }

  const lifecycle = getLifecycleApi(newRouter);

  for (const [name, handler] of Object.entries(externalDeactivate)) {
    lifecycle.addDeactivateGuard(name, handler);
  }

  for (const [name, handler] of Object.entries(externalActivate)) {
    lifecycle.addActivateGuard(name, handler);
  }

  // Plugin replay runs last and skips factories that a (contract-violating)
  // definition-guard factory already registered on the clone during the
  // re-compilation above — without the filter every clone would double-apply
  // such a plugin: once via the factory, once via this replay (#1331 review).
  const alreadyRegistered = new Set(newCtx.getCloneState().pluginFactories);
  const pluginsToReplay = pluginFactories.filter(
    (factory) => !alreadyRegistered.has(factory),
  );

  // Stryker disable next-line EqualityOperator: equivalent — `>= 0` is always true, but `usePlugin(...[])` with an empty spread is a no-op, so entering the block on an empty list behaves identically to skipping it. (ConditionalExpression stays live: `→false` skips a real plugin list and is killable.)
  if (pluginsToReplay.length > 0) {
    newRouter.usePlugin(...pluginsToReplay);
  }

  return newRouter;
}
