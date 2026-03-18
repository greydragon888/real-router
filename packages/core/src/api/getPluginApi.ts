import { throwIfDisposed } from "./helpers";
import { errorCodes } from "../constants";
import { getInternals } from "../internals";
import { validateListenerArgs } from "../namespaces/EventBusNamespace/validators";
import {
  validateMatchPathArgs,
  validateSetRootPathArgs,
  validateStateBuilderArgs,
} from "../namespaces/RoutesNamespace/validators";
import { validateMakeStateArgs } from "../namespaces/StateNamespace/validators";
import { RouterError } from "../RouterError";

import type { PluginApi } from "./types";
import type { DefaultDependencies, Params, Router } from "@real-router/types";

export function getPluginApi<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(router: Router<Dependencies>): PluginApi {
  const ctx = getInternals(router);

  return {
    makeState: (name, params, path, meta, forceId) => {
      if (!ctx.noValidate) {
        validateMakeStateArgs(name, params, path, forceId);
      }

      return ctx.makeState(
        name,
        params,
        path,
        meta?.params as
          | Record<string, Record<string, "url" | "query">>
          | undefined,
        forceId,
      );
    },
    buildState: (routeName, routeParams) => {
      if (!ctx.noValidate) {
        validateStateBuilderArgs(routeName, routeParams, "buildState");
      }

      const { name, params } = ctx.forwardState(routeName, routeParams);

      return ctx.buildStateResolved(name, params);
    },
    forwardState: <P extends Params = Params>(
      routeName: string,
      routeParams: P,
    ) => {
      if (!ctx.noValidate) {
        validateStateBuilderArgs(routeName, routeParams, "forwardState");
      }

      return ctx.forwardState(routeName, routeParams);
    },
    matchPath: (path) => {
      if (!ctx.noValidate) {
        validateMatchPathArgs(path);
      }

      return ctx.matchPath(path, ctx.getOptions());
    },
    setRootPath: (rootPath) => {
      throwIfDisposed(ctx.isDisposed);

      if (!ctx.noValidate) {
        validateSetRootPathArgs(rootPath);
      }

      ctx.setRootPath(rootPath);
    },
    getRootPath: ctx.getRootPath,
    addEventListener: (eventName, cb) => {
      throwIfDisposed(ctx.isDisposed);

      if (!ctx.noValidate) {
        validateListenerArgs(eventName, cb);
      }

      return ctx.addEventListener(eventName, cb);
    },
    buildNavigationState: (name, params = {}) => {
      if (!ctx.noValidate) {
        validateStateBuilderArgs(name, params, "buildNavigationState");
      }

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
      let list = ctx.interceptors.get(method);

      if (!list) {
        list = [];
        ctx.interceptors.set(method, list);
      }

      list.push(fn);

      return () => {
        const index = list.indexOf(fn);

        if (index !== -1) {
          list.splice(index, 1);
        }
      };
    },
    getRouteConfig: (name) => {
      const store = ctx.routeGetStore();

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

        if (idx !== -1) {
          ctx.routerExtensions.splice(idx, 1);
        }
      };
    },
  };
}
