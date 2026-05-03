import { UNKNOWN_ROUTE } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { serializeRouterState } from "@real-router/core/utils";
import { RouterProvider } from "@real-router/react";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { renderToReadableStream } from "react-dom/server";

import { App } from "./App";
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

  const stream = await renderToReadableStream(
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
    {
      onError(error: unknown) {
        console.error("[ssr] render error:", error);
      },
    },
  );

  return {
    stream,
    ssrJson,
    statusCode,
    cleanup: () => {
      router.dispose();
    },
  };
}
