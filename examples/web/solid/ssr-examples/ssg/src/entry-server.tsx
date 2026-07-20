import { UNKNOWN_ROUTE } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import {
  getStaticPaths as getStaticPathsFromRouter,
  serializeRouterState,
} from "@real-router/ssr-utils";
import { RouterProvider } from "@real-router/solid";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { generateHydrationScript, renderToString } from "solid-js/web";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";
import { entries } from "./router/entries";
import { loaders } from "./router/loaders";
import { NOT_FOUND_META, getMetaForState } from "./router/meta";

import type { PageMeta } from "./router/meta";

const baseRouter = createAppRouter();

interface RenderResult {
  html: string;
  hydrationScript: string;
  ssrJson: string;
  statusCode: number;
  meta: PageMeta;
}

export async function render(url: string): Promise<RenderResult> {
  const router = cloneRouter(baseRouter);

  router.usePlugin(ssrDataPluginFactory(loaders));

  try {
    const state = await router.start(url);
    const statusCode = state.name === UNKNOWN_ROUTE ? 404 : 200;

    const html = renderToString(() => (
      <RouterProvider router={router}>
        <App />
      </RouterProvider>
    ));

    const meta =
      state.name === UNKNOWN_ROUTE ? NOT_FOUND_META : getMetaForState(state);

    return {
      html,
      hydrationScript: generateHydrationScript(),
      ssrJson: serializeRouterState(state),
      statusCode,
      meta,
    };
  } finally {
    router.dispose();
  }
}

export async function getStaticPaths(): Promise<string[]> {
  return getStaticPathsFromRouter(baseRouter, entries);
}
