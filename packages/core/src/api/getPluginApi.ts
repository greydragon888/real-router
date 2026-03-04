import { errorCodes } from "../constants";
import { getInternals } from "../internals";
import { validateListenerArgs } from "../namespaces/EventBusNamespace/validators";
import { validateNavigateToStateArgs } from "../namespaces/NavigationNamespace/validators";
import {
  validateMatchPathArgs,
  validateSetRootPathArgs,
  validateStateBuilderArgs,
} from "../namespaces/RoutesNamespace/validators";
import { validateMakeStateArgs } from "../namespaces/StateNamespace/validators";
import { RouterError } from "../RouterError";

import type { PluginApi } from "./types";
import type { DefaultDependencies, Params, Router } from "@real-router/types";

function throwIfDisposed(isDisposed: () => boolean): void {
  if (isDisposed()) {
    throw new RouterError(errorCodes.ROUTER_DISPOSED);
  }
}

export function getPluginApi<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(router: Router<Dependencies>): PluginApi {
  const ctx = getInternals(router);

  return {
    makeState: (name, params, path, meta, forceId) => {
      if (!ctx.noValidate) {
        validateMakeStateArgs(name, params, path, forceId);
      }

      return ctx.makeState(name, params, path, meta, forceId);
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
    navigateToState: (toState, fromState, opts) => {
      throwIfDisposed(ctx.isDisposed);

      if (!ctx.noValidate) {
        validateNavigateToStateArgs(toState, fromState, opts);
      }

      return ctx.navigateToState(toState, fromState, opts);
    },
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
        {
          params: routeInfo.meta,
        },
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
  };
}
