import { UNKNOWN_ROUTE } from "@real-router/core";
import {
  createRequestScope,
  serializeRouterState,
  type IncomingMessageLike,
} from "@real-router/ssr-utils";
import {
  getSsrDataMode,
  ssrDataPluginFactory,
} from "@real-router/ssr-data-plugin";
import { RouterProvider } from "@real-router/vue";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";

import App from "./App.vue";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

const baseRouter = createAppRouter();

export interface RenderContext {
  req: IncomingMessageLike;
}

export interface RenderResult {
  html: string;
  serializedData: string;
  statusCode: number;
}

function wrapInScript(json: string): string {
  return `<script>window.__SSR_STATE__=${json}</script>`;
}

/**
 * Render the app for the given URL, branching on per-route SSR mode.
 *
 * - `"full"` — `renderToString(<App/>)`, ship HTML + JSON.
 * - `"data-only"` — ship a minimal shell + JSON.
 * - `"client-only"` — ship a minimal shell + JSON without `data`.
 */
export async function render(
  url: string,
  context: RenderContext,
): Promise<RenderResult> {
  const scope = createRequestScope(context.req, baseRouter);

  scope.router.usePlugin(ssrDataPluginFactory(loaders));

  try {
    const state = await scope.router.start(url);

    if (state.name === UNKNOWN_ROUTE) {
      return {
        html: '<div data-testid="not-found-shell">404</div>',
        serializedData: wrapInScript(serializeRouterState(state)),
        statusCode: 404,
      };
    }

    const mode = getSsrDataMode(state);
    let html: string;

    if (mode === "full") {
      const app = createSSRApp({
        render: () =>
          h(
            RouterProvider,
            { router: scope.router },
            { default: () => h(App) },
          ),
      });
      html = await renderToString(app);
    } else {
      html = `<div data-ssr-shell data-ssr-mode="${mode}">SSR mode: ${mode}</div>`;
    }

    return {
      html,
      serializedData: wrapInScript(serializeRouterState(state)),
      statusCode: 200,
    };
  } finally {
    await scope.dispose();
  }
}
