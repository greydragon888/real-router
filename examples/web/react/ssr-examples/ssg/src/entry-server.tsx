import { UNKNOWN_ROUTE } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import {
  getStaticPaths as getStaticPathsFromRouter,
  serializeRouterState,
} from "@real-router/core/utils";
import { RouterProvider } from "@real-router/react";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { renderToString } from "react-dom/server";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";
import { entries } from "./router/entries";
import { loaders } from "./router/loaders";

const baseRouter = createAppRouter();

interface RenderResult {
  html: string;
  ssrJson: string;
  statusCode: number;
}

export async function render(url: string): Promise<RenderResult> {
  const router = cloneRouter(baseRouter);

  router.usePlugin(ssrDataPluginFactory(loaders));

  try {
    const state = await router.start(url);
    const statusCode = state.name === UNKNOWN_ROUTE ? 404 : 200;

    const html = renderToString(
      <RouterProvider router={router}>
        <App />
      </RouterProvider>,
    );

    return {
      html,
      ssrJson: serializeRouterState(state),
      statusCode,
    };
  } finally {
    router.dispose();
  }
}

export async function getStaticPaths(): Promise<string[]> {
  return getStaticPathsFromRouter(baseRouter, entries);
}
