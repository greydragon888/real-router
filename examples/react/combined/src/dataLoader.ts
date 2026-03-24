import { getPluginApi } from "@real-router/core/api";

import { store } from "../../../shared/store";

import type { Params, PluginFactory, State } from "@real-router/core";

interface RouteConfigWithLoader {
  loadData?: (params: Params) => Promise<unknown>;
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
  onTransitionSuccess: (toState: State) => void;
} {
  const pluginApi = getPluginApi(router);

  const onTransitionSuccess = (toState: State): void => {
    const config = pluginApi.getRouteConfig(toState.name) as
      | RouteConfigWithLoader
      | undefined;

    if (!config?.loadData) {
      return;
    }

    store.set(`${toState.name}:loading`, true);
    store.set(`${toState.name}:error`, null);

    void (async () => {
      try {
        const data = await config.loadData!(toState.params);

        handleLoadDataSuccess(toState, data);
      } catch (error: unknown) {
        handleLoadDataError(toState, error);
      }
    })();
  };

  return { onTransitionSuccess };
}

export function dataLoaderPluginFactory(): PluginFactory {
  return createDataLoaderPlugin;
}
