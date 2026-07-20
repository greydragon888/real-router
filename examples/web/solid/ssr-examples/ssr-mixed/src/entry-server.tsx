import { UNKNOWN_ROUTE } from "@real-router/core";
import {
  createRequestScope,
  serializeRouterState,
  type IncomingMessageLike,
} from "@real-router/ssr-utils";
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

export interface RenderContext {
  req: IncomingMessageLike;
}

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
export async function render(
  url: string,
  context: RenderContext,
): Promise<RenderResult> {
  const scope = createRequestScope(context.req, baseRouter);

  scope.router.usePlugin(ssrDataPluginFactory(loaders));

  try {
    const state = await scope.router.start(url);
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
            <RouterProvider router={scope.router}>
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
    await scope.dispose();
  }
}
