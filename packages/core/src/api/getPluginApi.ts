import { throwIfDisposed } from "./helpers";
import { errorCodes } from "../constants";
import { getInternals } from "../internals";
import { RouterError } from "../RouterError";

import type { PluginApi } from "./types";
import type {
  ContextNamespaceClaim,
  DefaultDependencies,
  Params,
  Router,
  State,
} from "@real-router/types";

// Cache the assembled PluginApi per router — mirrors getNavigator() (#525):
// avoids re-allocating the closure-bag on each call (plugins call this once
// at init, but tests + nested plugins poll it), and gives spy/stub helpers
// a stable object identity to attach to (e.g. spying on
// `getPluginApi(router).navigateToState` to inject errors in popstate
// recovery tests).
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
    makeState: (name, params, path, meta) => {
      ctx.validator?.state.validateMakeStateArgs(name, params, path);

      return ctx.makeState(
        name,
        params,
        path,
        meta?.params as
          Record<string, Record<string, "url" | "query">> | undefined,
      );
    },
    buildState: (routeName, routeParams) => {
      ctx.validator?.routes.validateStateBuilderArgs(
        routeName,
        routeParams,
        "buildState",
      );

      const { name, params } = ctx.forwardState(routeName, routeParams);

      return ctx.buildStateResolved(name, params);
    },
    forwardState: <P extends Params = Params>(
      routeName: string,
      routeParams: P,
    ) => {
      ctx.validator?.routes.validateStateBuilderArgs(
        routeName,
        routeParams,
        "forwardState",
      );

      return ctx.forwardState(routeName, routeParams);
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

      ctx.validator?.routes.validateSetRootPathArgs(rootPath);

      ctx.setRootPath(rootPath);
    },
    getRootPath: ctx.getRootPath,
    addEventListener: (eventName, cb) => {
      throwIfDisposed(ctx.isDisposed);

      ctx.validator?.eventBus.validateListenerArgs(eventName, cb);

      return ctx.addEventListener(eventName, cb);
    },
    buildNavigationState: (name, params = {}) => {
      ctx.validator?.routes.validateStateBuilderArgs(
        name,
        params,
        "buildNavigationState",
      );

      const { name: resolvedName, params: resolvedParams } = ctx.forwardState(
        name,
        params,
      );
      const routeInfo = ctx.buildStateResolved(resolvedName, resolvedParams);

      if (!routeInfo) {
        return;
      }

      return ctx.makeState(
        routeInfo.name,
        routeInfo.params,
        ctx.buildPath(routeInfo.name, routeInfo.params),
        routeInfo.meta,
      );
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

      const keys = Object.keys(extensions);

      for (const key of keys) {
        if (key in router) {
          throw new RouterError(errorCodes.PLUGIN_CONFLICT, {
            message: `Cannot extend router: property "${key}" already exists`,
          });
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
        throw new RouterError(errorCodes.CONTEXT_NAMESPACE_ALREADY_CLAIMED, {
          message: `Cannot claim context namespace: "${namespace}" is already claimed by another plugin`,
        });
      }

      ctx.contextClaimRecords.add(namespace);

      return {
        write(state: State, value: unknown) {
          // `state.context[namespace] = value` dispatches into the inherited
          // Object.prototype.__proto__ setter for the literal key "__proto__",
          // swapping the prototype instead of creating an own entry — the data
          // then vanishes from Object.keys / serializeRouterState (#1191 N3).
          // Mirror search-params' assignParam: defineProperty writes a genuine
          // own property; normal names keep the plain-assignment fast path.
          if (namespace === "__proto__") {
            Object.defineProperty(state.context, namespace, {
              value,
              writable: true,
              enumerable: true,
              configurable: true,
            });
          } else {
            state.context[namespace] = value;
          }
        },
        release() {
          ctx.contextClaimRecords.delete(namespace);
        },
      } satisfies ContextNamespaceClaim;
    },
  };

  cache.set(router, api);

  return api;
}
