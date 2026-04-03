import { getPluginApi } from "@real-router/core/api";

import { store } from "../../../shared/store";

import type { Params, PluginFactory, State } from "@real-router/core";

interface RouteConfigWithLoader {
  loadData?: (params: Params, signal?: AbortSignal) => Promise<unknown>;
}

function handleLoadDataSuccess(toState: State, data: unknown): void {
  store.set(toState.name, data);
  store.set(`${toState.name}:loading`, false);
}

function handleLoadDataError(toState: State, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);

  store.set(`${toState.name}:error`, message);
  store.set(`${toState.name}:loading`, false);
}

function createDataLoaderPlugin(...[router]: Parameters<PluginFactory>): {
  onTransitionLeaveApprove: (toState: State, fromState?: State) => void;
  onTransitionSuccess: (toState: State) => void;
} {
  const pluginApi = getPluginApi(router);
  let currentController: AbortController | null = null;

  const onTransitionLeaveApprove = (
    _toState: State,
    fromState?: State,
  ): void => {
    if (fromState && currentController) {
      currentController.abort();
      currentController = null;
    }
  };

  const onTransitionSuccess = (toState: State): void => {
    const config = pluginApi.getRouteConfig(toState.name) as
      | RouteConfigWithLoader
      | undefined;

    if (!config?.loadData) {
      return;
    }

    store.set(`${toState.name}:loading`, true);
    store.set(`${toState.name}:error`, null);

    currentController = new AbortController();
    const { signal } = currentController;

    void (async () => {
      try {
        const data = await config.loadData!(toState.params, signal);

        if (!signal.aborted) {
          handleLoadDataSuccess(toState, data);
        }
      } catch (error: unknown) {
        if (signal.aborted) {
          return;
        }

        handleLoadDataError(toState, error);
      }
    })();
  };

  return { onTransitionLeaveApprove, onTransitionSuccess };
}

export function dataLoaderPluginFactory(): PluginFactory {
  return createDataLoaderPlugin;
}
