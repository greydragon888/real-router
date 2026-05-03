import { cloneRouter } from "@real-router/core/api";
import {
  getStaticPaths as getStaticPathsFromRouter,
  serializeState,
} from "@real-router/core/utils";
import { RouterProvider } from "@real-router/react";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { renderToString } from "react-dom/server";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";
import { entries } from "./router/entries";
import { loaders } from "./router/loaders";

const baseRouter = createAppRouter();

interface RenderResult {
  html: string;
  serializedData: string;
}

function wrapInScript(data: unknown): string {
  return `<script>window.__SSR_DATA__=${serializeState(data)}</script>`;
}

export async function render(url: string): Promise<RenderResult> {
  const router = cloneRouter(baseRouter);

  router.usePlugin(ssrDataPluginFactory(loaders));

  try {
    await router.start(url);
    const data = router.getRouteData();

    const html = renderToString(
      <RouterProvider router={router}>
        <App />
      </RouterProvider>,
    );

    return {
      html,
      serializedData: wrapInScript({ data }),
    };
  } finally {
    router.dispose();
  }
}

export async function getStaticPaths(): Promise<string[]> {
  return getStaticPathsFromRouter(baseRouter, entries);
}
