import { UNKNOWN_ROUTE } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { serializeRouterState } from "@real-router/core/utils";
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

function wrapInScript(json: string): string {
  return `<script>window.__SSR_STATE__=${json}</script>`;
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

    const html = renderToString(
      <RouterProvider router={router}>
        <App />
      </RouterProvider>,
    );

    // Hydration payload (#563): full server-resolved State (incl.
    // state.context.data from ssr-data-plugin). Client passes it to
    // hydrateRouter, which extracts state.path and calls router.start(path) —
    // matchPath/forwardState/buildPath re-run on client; for URL-deterministic
    // interceptors the result matches the server snapshot.
    return {
      html,
      serializedData: wrapInScript(serializeRouterState(state)),
      statusCode,
      redirect: null,
    };
  } catch {
    return { html: "", serializedData: "", statusCode: 302, redirect: "/" };
  } finally {
    router.dispose();
  }
}
