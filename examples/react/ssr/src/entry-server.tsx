import { UNKNOWN_ROUTE } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { serializeState } from "@real-router/core/utils";
import { RouterProvider } from "@real-router/react";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { renderToString } from "react-dom/server";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

const baseRouter = createAppRouter();

interface RenderContext {
  isAuthenticated: boolean;
}

interface RenderResult {
  html: string;
  serializedData: string;
  statusCode: number;
  redirect: string | null;
}

function wrapInScript(data: unknown): string {
  return `<script>window.__SSR_DATA__=${serializeState(data)}</script>`;
}

export async function render(
  url: string,
  context: RenderContext,
): Promise<RenderResult> {
  const router = cloneRouter(baseRouter, {
    isAuthenticated: context.isAuthenticated,
  });

  router.usePlugin(ssrDataPluginFactory(loaders));

  try {
    const state = await router.start(url);
    const statusCode = state.name === UNKNOWN_ROUTE ? 404 : 200;
    const data = router.getRouteData();

    const html = renderToString(
      <RouterProvider router={router}>
        <App />
      </RouterProvider>,
    );

    return {
      html,
      serializedData: wrapInScript({ data }),
      statusCode,
      redirect: null,
    };
  } catch {
    return { html: "", serializedData: "", statusCode: 302, redirect: "/" };
  } finally {
    router.dispose();
  }
}
