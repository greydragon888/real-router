import { UNKNOWN_ROUTE } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { serializeRouterState } from "@real-router/core/utils";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { render } from "svelte/server";

import App from "./App.svelte";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

const baseRouter = createAppRouter();

export interface RenderResult {
  html: string;
  head: string;
  ssrJson: string;
  statusCode: number;
}

export async function renderPage(url: string): Promise<RenderResult> {
  const router = cloneRouter(baseRouter);

  router.usePlugin(ssrDataPluginFactory(loaders));

  try {
    const state = await router.start(url);
    const statusCode = state.name === UNKNOWN_ROUTE ? 404 : 200;

    // `await render(...)` covers both sync components and components with
    // top-level `await` / `<svelte:boundary pending>`. Svelte 5
    // RenderOutput is `SyncRenderOutput & PromiseLike<SyncRenderOutput>`,
    // so awaiting is safe even when no async work is happening.
    const { head, body } = await render(App, { props: { router } });

    return {
      html: body,
      head,
      ssrJson: serializeRouterState(state),
      statusCode,
    };
  } finally {
    router.dispose();
  }
}
