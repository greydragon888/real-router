import { UNKNOWN_ROUTE } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import {
  getStaticPaths as getStaticPathsFromRouter,
  serializeRouterState,
} from "@real-router/ssr-utils";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { render } from "svelte/server";

import App from "./App.svelte";
import { createAppRouter } from "./router/createAppRouter";
import { entries } from "./router/entries";
import { loaders } from "./router/loaders";
import { NOT_FOUND_META, getMetaForState } from "./router/meta";

import type { PageMeta } from "./router/meta";

const baseRouter = createAppRouter();

interface RenderResult {
  html: string;
  head: string;
  ssrJson: string;
  statusCode: number;
  meta: PageMeta;
}

export async function renderPage(url: string): Promise<RenderResult> {
  const router = cloneRouter(baseRouter);

  router.usePlugin(ssrDataPluginFactory(loaders));

  try {
    const state = await router.start(url);
    const statusCode = state.name === UNKNOWN_ROUTE ? 404 : 200;

    const { head, body } = await render(App, { props: { router } });

    const meta =
      state.name === UNKNOWN_ROUTE ? NOT_FOUND_META : getMetaForState(state);

    return {
      html: body,
      head,
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
