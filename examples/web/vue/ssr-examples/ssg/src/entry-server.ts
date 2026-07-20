import { UNKNOWN_ROUTE } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import {
  getStaticPaths as getStaticPathsFromRouter,
  serializeRouterState,
} from "@real-router/ssr-utils";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { RouterProvider } from "@real-router/vue";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";

import App from "./App.vue";
import { createAppRouter } from "./router/createAppRouter";
import { entries } from "./router/entries";
import { loaders } from "./router/loaders";
import { NOT_FOUND_META, getMetaForState } from "./router/meta";

import type { PageMeta } from "./router/meta";

const baseRouter = createAppRouter();

interface RenderResult {
  html: string;
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

    const app = createSSRApp({
      render: () => h(RouterProvider, { router }, { default: () => h(App) }),
    });

    const html = await renderToString(app);

    const meta =
      state.name === UNKNOWN_ROUTE ? NOT_FOUND_META : getMetaForState(state);

    return {
      html,
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
