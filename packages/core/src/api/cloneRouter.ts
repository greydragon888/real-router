import { routeTreeToDefinitions } from "route-tree";

import { errorCodes } from "../constants";
import { getInternals } from "../internals";
import { Router as RouterClass } from "../Router";
import { RouterError } from "../RouterError";
import { getLifecycleApi } from "./getLifecycleApi";

import type { Route } from "../types";
import type { DefaultDependencies, Router } from "@real-router/types";

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

  const options = ctx.cloneOptions();
  const sourceDeps = ctx.cloneDependencies();
  const [canDeactivateFactories, canActivateFactories] =
    ctx.getLifecycleFactories();
  const pluginFactories = ctx.getPluginFactories();

  const mergedDeps = {
    ...sourceDeps,
    ...dependencies,
  } as Dependencies;

  const newRouter = new RouterClass<Dependencies>(
    routes as Route<Dependencies>[],
    options,
    mergedDeps,
  );

  const lifecycle = getLifecycleApi(newRouter);

  for (const [name, handler] of Object.entries(canDeactivateFactories)) {
    lifecycle.addDeactivateGuard(name, handler);
  }

  for (const [name, handler] of Object.entries(canActivateFactories)) {
    lifecycle.addActivateGuard(name, handler);
  }

  if (pluginFactories.length > 0) {
    newRouter.usePlugin(...pluginFactories);
  }

  const newCtx = getInternals(newRouter);
  const newStore = newCtx.routeGetStore();

  // Apply cloned config directly to new store
  Object.assign(newStore.config.decoders, routeConfig.decoders);
  Object.assign(newStore.config.encoders, routeConfig.encoders);
  Object.assign(newStore.config.defaultParams, routeConfig.defaultParams);
  Object.assign(newStore.config.forwardMap, routeConfig.forwardMap);
  Object.assign(newStore.config.forwardFnMap, routeConfig.forwardFnMap);
  Object.assign(newStore.resolvedForwardMap, resolvedForwardMap);
  Object.assign(newStore.routeCustomFields, routeCustomFields);

  return newRouter;
}
