import { UNKNOWN_ROUTE } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { serializeRouterState } from "@real-router/core/utils";
import { RouterProvider } from "@real-router/vue";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { createSSRApp, h } from "vue";
import { renderToWebStream } from "vue/server-renderer";

import App from "./App.vue";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

const baseRouter = createAppRouter();

export interface RenderResult {
  stream: ReadableStream<Uint8Array>;
  ssrJson: string;
  statusCode: number;
  cleanup: () => void;
}

export async function render(url: string): Promise<RenderResult> {
  const router = cloneRouter(baseRouter);

  router.usePlugin(ssrDataPluginFactory(loaders));

  const state = await router.start(url);
  const statusCode = state.name === UNKNOWN_ROUTE ? 404 : 200;

  const ssrJson = serializeRouterState(state);

  const app = createSSRApp({
    render: () =>
      h(RouterProvider, { router }, { default: () => h(App) }),
  });

  const stream = renderToWebStream(app);

  return {
    stream,
    ssrJson,
    statusCode,
    cleanup: () => {
      router.dispose();
    },
  };
}
