import { UNKNOWN_ROUTE } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { serializeRouterState } from "@real-router/core/utils";
import {
  getSsrDataMode,
  ssrDataPluginFactory,
} from "@real-router/ssr-data-plugin";
import { render } from "svelte/server";

import App from "./App.svelte";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

const baseRouter = createAppRouter();

export interface RenderResult {
  html: string;
  head: string;
  serializedData: string;
  statusCode: number;
}

function wrapInScript(json: string): string {
  return `<script>window.__SSR_STATE__=${json}</script>`;
}

/**
 * Render the app for the given URL, branching on per-route SSR mode.
 */
export async function renderApp(url: string): Promise<RenderResult> {
  const router = cloneRouter(baseRouter);

  router.usePlugin(ssrDataPluginFactory(loaders));

  try {
    const state = await router.start(url);

    if (state.name === UNKNOWN_ROUTE) {
      return {
        html: '<div data-testid="not-found-shell">404</div>',
        head: "",
        serializedData: wrapInScript(serializeRouterState(state)),
        statusCode: 404,
      };
    }

    const mode = getSsrDataMode(state);

    if (mode === "full") {
      const { head, body } = render(App, { props: { router } });
      return {
        html: body,
        head,
        serializedData: wrapInScript(serializeRouterState(state)),
        statusCode: 200,
      };
    }

    return {
      html: `<div data-ssr-shell data-ssr-mode="${mode}">SSR mode: ${mode}</div>`,
      head: "",
      serializedData: wrapInScript(serializeRouterState(state)),
      statusCode: 200,
    };
  } finally {
    router.dispose();
  }
}
