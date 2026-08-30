import { errorCodes } from "../constants";
import { routeTreeToDefinitions } from "../engine";
import { ingestDependencies } from "../guards";
import { getInternals } from "../internals";
import { getLifecycleApi } from "./getLifecycleApi";
import { assignConfigEntries } from "../namespaces/RoutesNamespace/helpers";
import { adoptForwardState } from "../namespaces/RoutesNamespace/routesStore";
import { Router as RouterClass } from "../Router";
import { RouterError, freezeThrownError } from "../RouterError";
import { putField } from "../utils/ingest";

import type {
  DefaultDependencies,
  LoggerConfig,
  Router,
  Route,
} from "../types";

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — each answers "what is on this object" for a value this module
 * did not build, so read off the live global they are the weakest point of every
 * check built on them. `guards.ts` states the doctrine and its measurement: one
 * naive `Object.hasOwn` polyfill walked straight through five sibling readers
 * while the single captured guard held.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it — a shim evaluated ahead of core still wins
 * (#1798), which is the doctrine's own caveat and travels with it.
 */
const objectEntries = Object.entries;
const hasOwn = Object.hasOwn;
const objectKeys = Object.keys;

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
 * @see createRequestScope — `@real-router/ssr-utils` SSR helper that
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
    throw freezeThrownError(new RouterError(errorCodes.ROUTER_DISPOSED));
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
    limits: sourceLimits,
  } = ctx.getCloneState();
  // Origin-aware factory snapshot — definition guards are re-registered with
  // `isFromDefinition=true` on the clone so `replace()` can still strip them
  // via `clearDefinitionGuards()`. External guards take the public lifecycle
  // API path so they survive `replace()` symmetric with the base.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
  const sourceLifecycleNamespace = sourceStore.lifecycleNamespace!;
  const { definition: definitionFactories, external: externalFactories } =
    sourceLifecycleNamespace.getFactoriesByOrigin();

  // ⚑ The caller's bag goes through the SAME door the constructor uses (#1860),
  // and the merge IS that door's walk (#1861). The spread used to come first,
  // which flattened whatever the caller passed into a fresh literal before
  // `guardDependencies` ever saw it — so the check was structurally vacuous with
  // respect to the argument it was meant to judge, and this door accepted a
  // string, an array, a class instance, a `Map` and an own getter that RAN.
  // `cloneRouter` is the per-request SSR path (`angular/providersFactory`
  // forwards an application-authored `RequestDepsFactory` result straight here),
  // so `Map` silently becoming `{}` lost every dependency with no error at all.
  const mergedDeps = { ...sourceDeps } as Record<string, unknown>;

  if (dependencies !== undefined) {
    ingestDependencies(dependencies, (key, value) => {
      // ⚠ `putField`, not `mergedDeps[key] = value`. This destination is an
      // ORDINARY literal (`{ ...sourceDeps }`), so it carries `Object.prototype`
      // and a bare `[[Set]]` of `"__proto__"` would dispatch into the inherited
      // setter and swap the prototype instead of storing (#1852). The spread it
      // replaced was immune for free — a spread DEFINES — so writing the loop
      // without this would have been a regression, not a refactor.
      putField(mergedDeps, key, value);
    });
  }

  // The clone builds its OWN logger (isolation, #724) but INHERITS the base's
  // resolved config — frozen options don't carry `logger`, so without this the
  // clone would fall back to the default logger and lose the base's
  // callback/level (an M1 regression the singleton used to mask). A per-request
  // `opts.logger` override (e.g. a traceId-bound callback) merges on top.
  const clonedLoggerConfig: Partial<LoggerConfig> = opts?.logger
    ? { ...loggerConfig, ...opts.logger }
    : loggerConfig;

  // ⚑ The base's KEY, not its raw option (#1877). `urlParamsEncoding` is
  // supported input — a `toString`-backed value is legal — and building the
  // clone from `options` coerced it a SECOND time, so a drifting value gave the
  // clone a different encoding, and decoder, from its base. `createRequestScope`
  // clones per request, which is exactly where that lands.
  //
  // ⚠ `queryParams` is deliberately NOT inherited. Its clone-time re-read is
  // pinned as intended by `query-strategy-formats-1796.test.ts` ("a DRIFT is
  // confined to the clone") and documented in the wiki under `RouterOptions` ›
  // `queryParams`; changing it is a policy decision, not this fix.
  //
  // ⚠ The clone's own `getOptions()` therefore reports the coerced key where the
  // base still reports the caller's value. That is a deliberate consequence, not
  // an oversight: only the clone honours the documented four-literal type.
  const newRouter = new RouterClass<Dependencies>(
    routes as Route<Dependencies>[],
    {
      ...options,
      logger: clonedLoggerConfig,
      // The base's RESOLVED limits, not its raw `options.limits` (#1880).
      // `createLimits`' spread re-invokes an accessor on the caller's bag, so
      // rebuilding from `options` gave a drifting getter a second answer and
      // the clone a different cap. These are already numbers.
      //
      // ⚠ Only the keys the base actually PASSED, resolved — not the whole
      // resolved bag. Substituting wholesale materialises the four unset
      // DEFAULTS into the clone's reported options, and that is not cosmetic:
      // `warnListeners: 1000` beside a SMALL `maxListeners` is a pair
      // `validation-plugin` refuses at install, so `cloneRouter` throws and
      // `createRequestScope` fails on EVERY request. Measured: 1 of 6 partial
      // bags, not all of them — `validators/options.ts` throws only when
      // `warnListeners > maxListeners > 0`, so it needs the base to have passed
      // a `maxListeners` under the 1000 default, and it needs the plugin
      // installed at all.
      //
      // ⚠ `Object.keys(options.limits)` — the CALLER's bag, mirroring the base's
      // own spread. That is the reason a refactorer needs, and it is stronger
      // than the prototype-key argument below: both are enumerability-sensitive,
      // so the clone's key set is exactly the base's. Walking `sourceLimits`
      // instead and filtering by `hasOwn(options.limits, key)` is four lines
      // shorter and passes every other cell — and it is WRONG, because the
      // spread skips a NON-ENUMERABLE own key while the resolved bag carries the
      // materialised default for it. Pinned.
      //
      // `Object.keys` does not invoke the bag's accessors, so #1880 still holds:
      // the VALUES all come from `sourceLimits`, which the base resolved once.
      // (`OptionsNamespace` also deep-freezes the caller's bag before
      // `createLimits` runs, so the second enumeration cannot see a different
      // key set from the first.)
      //
      // ⚠ `Object.hasOwn`, NOT `key in sourceLimits`. `in` walks the prototype
      // chain, so it answers true for `"__proto__"`, `"constructor"`,
      // `"toString"` and every other `Object.prototype` member — a caller bag
      // built by `JSON.parse` can carry those as OWN keys, and they would have
      // been copied into the clone's reported options with an `Object.prototype`
      // MEMBER as the value: `Object.prototype` itself for `"__proto__"`, the
      // `Object` constructor for `"constructor"`, the native method for
      // `"toString"`. Measured: all three pass `in`, none passes `hasOwn`.
      //
      // ⚠ `!= null`, NOT `!== undefined`. `Object.keys(null)` THROWS, and the
      // base survives `limits: null` — `createLimits`' default parameter only
      // catches `undefined`, and `{ ...DEFAULT_LIMITS, ...null }` is a no-op
      // spread — so a `!== undefined` gate made the clone, and only the clone,
      // die on a config the base had accepted: silent at construction, fatal
      // per request inside `createRequestScope`. Skipping the substitution is
      // the CORRECT answer for `null`, not a mere guard: `...options` still
      // carries it, and the clone resolves it to the same defaults the base did.
      ...(options.limits != null && {
        limits: Object.fromEntries(
          objectKeys(options.limits)
            .filter((key) => hasOwn(sourceLimits, key))
            .map((key) => [
              key,
              sourceLimits[key as keyof typeof sourceLimits],
            ]),
        ),
      }),
      // ⚠ The spread form is not stylistic — the three obvious alternatives were
      // each tried and each loses. `matcherOptions` and its `urlParamsEncoding`
      // are `| undefined` in the TYPE only (`createRoutesStore` has one caller,
      // always fed `deriveMatcherOptions(...)`, whose `snapshotEncodingKey`
      // returns a string on every path), so: a plain read fails TS2379 under
      // `exactOptionalPropertyTypes`; `?? "default"` adds an arm no test can
      // reach and drops branch coverage to 99.95%, which the 100% gate refuses;
      // a non-null assertion still yields `| undefined` and fails TS2379 too.
      // The spread's false arm is unreachable but costs no branch — v8 scores
      // `&&` as an operand pair, both hit.
      //
      // ⚠ It reads the field TWICE — guard, then value — which is structurally
      // the TOCTOU shape #1811 is about. It is safe HERE and only here: the
      // source is core-owned frozen plain data in a sealed slot, not a
      // caller-owned bag. Do not copy the pattern to a caller-owned source.
      ...(sourceStore.matcherOptions?.urlParamsEncoding !== undefined && {
        urlParamsEncoding: sourceStore.matcherOptions.urlParamsEncoding,
      }),
    },
    mergedDeps as Dependencies,
  );

  const newCtx = getInternals(newRouter);
  const newStore = newCtx.routeGetStore();
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
  const newLifecycleNamespace = newStore.lifecycleNamespace!;

  // Copy the source config + store-level maps BEFORE re-registering guards
  // (#1331 review): the definition-guard factories re-executed below must
  // observe the fully-built clone (encoders/decoders/defaultParams/custom
  // fields), mirroring the constructor where flushPendingGuards runs after the
  // store is complete. EVERY RouteConfig sub-map goes through a single
  // enumeration so a newly added config field is carried over automatically
  // (#965) — deliberately uncounted here: this sentence said "five" until
  // defaultSearch made six (#1548), while the enumeration had already been
  // carrying it. resolvedForwardMap and routeCustomFields are store-level (not
  // part of RouteConfig) and stay explicit.
  assignConfigEntries(newStore.config, routeConfig);
  // ⚑ Through `adoptForwardState`, not a bare assign (#1800). The forward state
  // is TWO halves — the map and the derived `hasAnyForward` flag — and this line
  // used to write only the first. The clone's store is built from
  // `routeTreeToDefinitions(sourceStore.tree)`, bare `{name, path, children}`
  // with no `forwardTo`, so it starts at `hasAnyForward = false`; installing the
  // config behind that flag left `isActiveRoute` answering `false` for every
  // forwarding route on every clone — and `createRequestScope` clones per
  // request, so that is every SSR render.
  //
  // `Object.assign` stays INSIDE the call: it merges into the clone's own map
  // and returns it, so the clone keeps its own object. Passing
  // `resolvedForwardMap` directly would install the SOURCE's map by reference
  // and alias the two stores.
  adoptForwardState(
    newStore,
    Object.assign(newStore.resolvedForwardMap, resolvedForwardMap),
  );
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

  for (const [name, handler] of objectEntries(definitionDeactivate)) {
    newLifecycleNamespace.addCanDeactivate(name, handler, true);
  }

  for (const [name, handler] of objectEntries(definitionActivate)) {
    newLifecycleNamespace.addCanActivate(name, handler, true);
  }

  const lifecycle = getLifecycleApi(newRouter);

  for (const [name, handler] of objectEntries(externalDeactivate)) {
    lifecycle.addDeactivateGuard(name, handler);
  }

  for (const [name, handler] of objectEntries(externalActivate)) {
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
