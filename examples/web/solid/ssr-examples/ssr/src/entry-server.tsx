import { UNKNOWN_ROUTE } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { serializeRouterState } from "@real-router/core/utils";
import { RouterProvider } from "@real-router/solid";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { generateHydrationScript, renderToString } from "solid-js/web";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

import type { CurrentUser } from "./_known-users";

const baseRouter = createAppRouter();

interface RenderContext {
  currentUser: CurrentUser | null;
}

export interface RenderResult {
  html: string;
  hydrationScript: string;
  serializedData: string;
  statusCode: number;
  redirect: string | null;
}

function wrapInScript(json: string): string {
  return `<script>window.__SSR_STATE__=${json}</script>`;
}

function renderErrorPage(message: string): string {
  return `<div data-testid="server-error"><h1>Server Error</h1><p>${message}</p></div>`;
}

export async function render(
  url: string,
  context: RenderContext,
): Promise<RenderResult> {
  const router = cloneRouter(baseRouter, { currentUser: context.currentUser });

  router.usePlugin(ssrDataPluginFactory(loaders));

  try {
    const state = await router.start(url);
    const statusCode = state.name === UNKNOWN_ROUTE ? 404 : 200;

    const html = renderToString(() => (
      <RouterProvider router={router}>
        <App />
      </RouterProvider>
    ));

    return {
      html,
      hydrationScript: generateHydrationScript(),
      serializedData: wrapInScript(serializeRouterState(state)),
      statusCode,
      redirect: null,
    };
  } catch (error) {
    const code = (error as { code?: string }).code;

    if (code === "CANNOT_ACTIVATE") {
      return {
        html: "",
        hydrationScript: "",
        serializedData: "",
        statusCode: 302,
        redirect: "/",
      };
    }

    const message = error instanceof Error ? error.message : "Unknown error";

    return {
      html: renderErrorPage(message),
      hydrationScript: "",
      serializedData: "",
      statusCode: 500,
      redirect: null,
    };
  } finally {
    router.dispose();
  }
}
