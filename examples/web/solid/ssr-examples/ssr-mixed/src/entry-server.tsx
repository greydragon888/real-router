import { UNKNOWN_ROUTE } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { serializeRouterState } from "@real-router/core/utils";
import { RouterProvider } from "@real-router/solid";
import {
  getSsrDataMode,
  ssrDataPluginFactory,
} from "@real-router/ssr-data-plugin";
import { generateHydrationScript, renderToStringAsync } from "solid-js/web";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

const baseRouter = createAppRouter();

export interface RenderResult {
  html: string;
  hydrationScript: string;
  serializedData: string;
  statusCode: number;
}

function wrapInScript(json: string): string {
  return `<script>window.__SSR_STATE__=${json}</script>`;
}

/**
 * Render the app for the given URL, branching on per-route SSR mode.
 */
export async function render(url: string): Promise<RenderResult> {
  const router = cloneRouter(baseRouter);

  router.usePlugin(ssrDataPluginFactory(loaders));

  try {
    const state = await router.start(url);
    const hydrationScript = generateHydrationScript();

    if (state.name === UNKNOWN_ROUTE) {
      return {
        html: '<div data-testid="not-found-shell">404</div>',
        hydrationScript,
        serializedData: wrapInScript(serializeRouterState(state)),
        statusCode: 404,
      };
    }

    const mode = getSsrDataMode(state);
    const html =
      mode === "full"
        ? await renderToStringAsync(() => (
            <RouterProvider router={router}>
              <App />
            </RouterProvider>
          ))
        : `<div data-ssr-shell data-ssr-mode="${mode}">SSR mode: ${mode}</div>`;

    return {
      html,
      hydrationScript,
      serializedData: wrapInScript(serializeRouterState(state)),
      statusCode: 200,
    };
  } finally {
    router.dispose();
  }
}
