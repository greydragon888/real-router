import { assertShippedChannelCorrect } from "../channels";
import { buildURLForCommit, canonicalize, materialize } from "../pipeline";
import { throwIfDisposed, throwIfReentrantTreeMutation } from "./helpers";
import { errorCodes } from "../constants";
import { assertEventNameIsValid } from "../guards";
import { getInternals, throwOnMisChanneledKey } from "../internals";
import { validateSetRootPath } from "../namespaces/RoutesNamespace/routeGuards";
import { RouterError, freezeThrownError } from "../RouterError";
import { putField } from "../utils/ingest";

import type { PluginApi } from "./types";
import type {
  ContextNamespaceClaim,
  DefaultDependencies,
  Params,
  Router,
  SearchParams,
  State,
} from "../types";

/** Captured like the deciding seven, but this one BUILDS the guarantee (#2073). */
const freeze = Object.freeze;

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
const objectKeys = Object.keys;

// Cache the assembled PluginApi per router — mirrors getNavigator() (#525):
// avoids re-allocating the closure-bag on each call (plugins call this once
// at init, but tests + nested plugins poll it).
//
// ⚠ A stub belongs one layer DOWN, on `getInternals(router)` (#1805): a spy
// there intercepts a call made through this surface — measured — while a spy
// HERE would land on the object nineteen packages share.
//
// ⚠ Members fall into THREE classes, and the advice differs per class: one
// CALLS `ctx.<name>()` and is intercepted whenever the spy stands, one ALIASES
// `ctx.<name>` and captures it when this cached surface is BUILT — so a spy
// installed afterwards is missed — and one composes its answer locally and has
// no seam at all. Which member is which is derived, not listed here:
// `tests/functional/plugin-api-stub-seam-authority-1805.test.ts` owns the sets
// and measures the order-dependence, because naming them in prose has been
// wrong twice.
const cache = new WeakMap<object, PluginApi>();

export function getPluginApi<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(router: Router<Dependencies>): PluginApi {
  const cached = cache.get(router);

  if (cached) {
    return cached;
  }

  const ctx = getInternals(router);
  const api: PluginApi = {
    makeState: (name, params, search, path) => {
      throwOnMisChanneledKey(ctx, "makeState", name, params);

      ctx.validator?.state.validateMakeStateArgs(name, params, path);
      ctx.validator?.navigation.validateSearch(search, "makeState");

      // Public PluginApi.makeState carries the query channel (RFC-4 M2 / #1548)
      // so plugins (e.g. browser-plugin popstate restore) can reconstruct a
      // split state from a serialized history entry. The former `meta` argument
      // (per-segment param-source map) was dropped when the `stateMetaStore`
      // WeakMap was removed — ownership is now read from the live matcher by
      // `state.name`, so a caller-supplied meta had no effect and is gone.
      return ctx.makeState(name, params, search, path);
    },
    forwardState: <
      P extends Params = Params,
      S extends SearchParams = SearchParams,
    >(
      routeName: string,
      routeParams: P,
      routeSearch?: S,
    ) => {
      ctx.validator?.routes.validateStateBuilderArgs(
        routeName,
        routeParams,
        "forwardState",
      );
      ctx.validator?.navigation.validateSearch(routeSearch, "forwardState");

      return ctx.forwardState<P, S>(routeName, routeParams, routeSearch);
    },
    matchPath: (path) => {
      ctx.validator?.routes.validateMatchPathArgs(path);

      return ctx.matchPath(path, ctx.getOptions());
    },
    navigateToState: (state, options) => {
      throwIfDisposed(ctx.isDisposed);

      ctx.validator?.navigation.validateNavigateToStateArgs(state);

      if (options !== undefined) {
        ctx.validator?.navigation.validateNavigationOptions(
          options,
          "navigateToState",
        );
      }

      return ctx.navigateToState(state, options);
    },
    setRootPath: (rootPath) => {
      throwIfDisposed(ctx.isDisposed);
      // The sixth tree mutator, and the one that joined the family late (#1751).
      // `applyRootPath` rebuilds tree AND matcher, so a call from inside a
      // `subscribeChanges` handler swaps what the router resolves against while
      // the listeners still queued in that dispatch reason about the payload's
      // tree. Ordered AFTER `throwIfDisposed` deliberately: `dispose()` sends
      // DISPOSE before `clearAll()`, and `clearAll()` leaves `#dispatching`
      // standing (#1164), so both predicates are true during a teardown reached
      // from a handler — `ROUTER_DISPOSED` has to keep winning there.
      throwIfReentrantTreeMutation(ctx.treeChanged.isEmitting);

      ctx.validator?.routes.validateSetRootPathArgs(rootPath);

      // ⚑ Returns whether it APPLIED, and that is the one place this door
      // departs from its route-CRUD siblings (all `void` + log). It has to: the
      // siblings are application-facing, where a human reads the console, while
      // this one is plugin-facing, and the caller that most needs the answer is
      // a `teardown()`. The refusal's whole justification — "a condition that
      // clears by itself gets a log" — is FALSE for a teardown: the plugin will
      // never call again, so a refused restore is permanent and, returning
      // `void`, undetectable. Measured: a plugin holding a path prefix, torn
      // down mid-navigation, leaked that prefix forever.
      //
      // ⚑ The sixth member of the in-flight family rule, and the last to join it
      // (#1755). Validation runs ABOVE it: an argument-shape defect is the
      // caller's bug whatever the router is doing, while this refusal is about
      // timing, and reporting the timing first would hide a `TypeError` behind a
      // log line the caller did not cause.
      //
      // ⚠ That matches `remove` (and `update`'s argument half) and CONTRADICTS
      // `replace`, which puts its in-flight gate above `guardRouteStructure` and
      // every validator. The family is not uniform on this axis, so the ordering
      // is chosen on its merits here rather than copied — do not read it as a
      // convention.
      if (
        !validateSetRootPath(
          ctx.getRootPath(),
          rootPath,
          ctx.isTransitioning(),
          ctx.logger,
        )
      ) {
        return false;
      }

      ctx.setRootPath(rootPath);

      return true;
    },
    getRootPath: ctx.getRootPath,
    addEventListener: (eventName, cb) => {
      throwIfDisposed(ctx.isDisposed);

      assertEventNameIsValid(eventName);
      ctx.validator?.eventBus.validateListenerArgs(eventName, cb);

      return ctx.addEventListener(eventName, cb);
    },
    buildNavigationState: (name, params = {}, search = {}) => {
      throwOnMisChanneledKey(ctx, "buildNavigationState", name, params);

      ctx.validator?.navigation.validateSearch(search, "buildNavigationState");
      ctx.validator?.routes.validateStateBuilderArgs(
        name,
        params,
        "buildNavigationState",
      );

      // Stages ① + ③ + the mode gate, one pass through the pipeline
      // (nav-pipeline Phase 2, step 2-4). `search` flows THROUGH the forwardState
      // seam, not past it (#1571) — `port.resolveForward` IS `ctx.forwardState`,
      // so the seam is still where an explicit query value wins over a declared
      // twin the caller rode in `params`, and where a `search-schema`
      // interceptor sees the query channel.
      const canonical = canonicalize(ctx.port(), name, params, search, {
        diagnoseUndeclared: true,
      });

      // Existence is checked BEFORE the URL is built, and the order is
      // load-bearing: `buildURL` prints through the matcher, which throws on an
      // unknown route, whereas this entry point answers `undefined` for one —
      // including when a `forwardTo` chain resolves to a target that does not
      // exist. (`canonicalize` itself is total here: a missing route simply has
      // no defaults and no declared query names.)
      if (!ctx.buildStateResolved(canonical.name, canonical.path)) {
        return;
      }

      // ⑤a then ⑤b from ONE canonical intent, so `state.search` and `state.path`
      // cannot derive from differently-merged bags. `buildURL` is usable here for
      // the same reason it is in `canNavigateTo`: this point is not the one the
      // port prints through, so there is no recursion (contrast `buildPath`).
      assertShippedChannelCorrect(
        "buildNavigationState",
        canonical.name,
        canonical.path,
        ctx.port().queryNames(canonical.name),
      );

      return materialize(canonical, buildURLForCommit(canonical, ctx.port()));
    },
    getOptions: ctx.getOptions,
    getTree: ctx.getTree,
    addInterceptor: (method, fn) => {
      throwIfDisposed(ctx.isDisposed);
      ctx.validator?.plugins.validateAddInterceptorArgs(method, fn);
      let list = ctx.interceptors.get(method);

      if (!list) {
        list = [];
        ctx.interceptors.set(method, list);
      }

      list.push(fn);

      // Idempotency flag (#1198). Without it, a double call would `indexOf(fn)`
      // again and splice a DUPLICATE registration of the same fn — silently
      // deactivating another plugin's interceptor whose own unsubscribe was never
      // called. The `Unsubscribe` contract is documented idempotent. The flag
      // guarantees exactly one splice of a still-present `fn`, so no `index !== -1`
      // guard is needed (it would be dead — the second call returns above).
      let removed = false;

      return () => {
        if (removed) {
          return;
        }

        removed = true;
        list.splice(list.indexOf(fn), 1);
      };
    },
    getRouteConfig: (name) => {
      const store = ctx.routeGetStore();

      // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent — a missing route yields routeCustomFields[name] === undefined, identical to this early return
      if (!store.matcher.hasRoute(name)) {
        return;
      }

      return store.routeCustomFields[name];
    },
    extendRouter: (extensions: Record<string, unknown>) => {
      throwIfDisposed(ctx.isDisposed);

      const keys = objectKeys(extensions);

      for (const key of keys) {
        if (key in router) {
          throw freezeThrownError(
            new RouterError(errorCodes.PLUGIN_CONFLICT, {
              message: `Cannot extend router: property "${key}" already exists`,
            }),
          );
        }
      }

      for (const key of keys) {
        (router as Record<string, unknown>)[key] = extensions[key];
      }

      const extensionRecord = { keys };

      ctx.routerExtensions.push(extensionRecord);

      let removed = false;

      return () => {
        if (removed) {
          return;
        }

        removed = true;

        for (const key of extensionRecord.keys) {
          delete (router as Record<string, unknown>)[key];
        }

        const idx = ctx.routerExtensions.indexOf(extensionRecord);

        // Stryker disable next-line ConditionalExpression,EqualityOperator,UnaryOperator,BlockStatement: equivalent — this splice only tidies the `routerExtensions` TRACKING array; the router INSTANCE is cleaned by the `delete router[key]` loop above, and dispose()'s safety-net re-deletes any leaked key harmlessly. So no mutation of this guard/splice is behaviourally observable (full suite green with `===`, `+1`, and an empty body). Contrast the addInterceptor splice, which IS observable through buildPath and is killed behaviourally by invariantGuardMutants.test.ts.
        if (idx !== -1) {
          ctx.routerExtensions.splice(idx, 1);
        }
      };
    },
    emitTransitionError: (error) => {
      throwIfDisposed(ctx.isDisposed);
      ctx.emitTransitionError(error);
    },
    claimContextNamespace: (namespace: string) => {
      throwIfDisposed(ctx.isDisposed);

      // Input-shape guard, symmetric with the other always-on invariant guards
      // (subscribe / start / navigateToNotFound each typeof-check their input).
      // A non-string namespace coerces to an inconsistent key ("42"); an empty
      // string is a meaningless namespace (#1191 N4).
      if (typeof namespace !== "string" || namespace === "") {
        throw new TypeError(
          `[claimContextNamespace] namespace must be a non-empty string, got ${
            typeof namespace === "string" ? "an empty string" : typeof namespace
          }`,
        );
      }

      if (ctx.contextClaimRecords.has(namespace)) {
        throw freezeThrownError(
          new RouterError(errorCodes.CONTEXT_NAMESPACE_ALREADY_CLAIMED, {
            message: `Cannot claim context namespace: "${namespace}" is already claimed by another plugin`,
          }),
        );
      }

      // ⚑ The record stores the CLAIM, not just its name, so both methods below
      // can ask whether they are still the holder (#2059 / #1929). Without that
      // identity a released claim is indistinguishable from the live one, and
      // the "two plugins clobber each other" corruption this mechanism exists to
      // prevent is reachable with the records perfectly consistent.
      const claim: ContextNamespaceClaim = {
        write(state: State, value: unknown) {
          if (ctx.contextClaimRecords.get(namespace) !== claim) {
            return;
          }

          // ⚑ `putField`, not the `namespace === "__proto__"` special case this
          // replaces (#1191 N3 → #1852). That form closed exactly one LITERAL,
          // and the key here is a plugin's namespace: the names that hurt are
          // the ordinary ones the shipped plugins already use. Measured on a
          // real navigation with an ambient `data` / `rsc` accessor, the outcome
          // was not even an error the caller could see — `claim.write` runs from
          // an `onTransitionSuccess` hook, so the emitter's throw isolation ate
          // it, `start()` resolved, and `getState().context` was `{}`.
          putField(state.context, namespace, value);
        },
        release() {
          if (ctx.contextClaimRecords.get(namespace) !== claim) {
            return;
          }

          ctx.contextClaimRecords.delete(namespace);
        },
      };

      ctx.contextClaimRecords.set(namespace, claim);

      return claim;
    },
  };

  // ⚑ FROZEN, and the cache above is what makes it necessary (#1805). One object
  // per router is handed to every consumer — nineteen units across the repo — so
  // a single `api.addInterceptor = …`, the shape an "instrument everything" line
  // takes, rewires the surface for all of them silently. `getRoutesApi` and
  // `getNavigator` next door are frozen for the same reason; the two UNCACHED
  // factories (`getLifecycleApi`, `getDependenciesApi`) need nothing, because a
  // write to a per-call object cannot reach a second consumer.
  const frozen = freeze(api);

  cache.set(router, frozen);

  return frozen;
}
