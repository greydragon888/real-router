import { UNKNOWN_ROUTE } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { serializeRouterState } from "@real-router/core/utils";
import { RouterProvider } from "@real-router/vue";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";

import App from "./App.vue";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

const baseRouter = createAppRouter();

export interface CurrentUser {
  id: string;
  name: string;
  role: "admin" | "user";
}

interface RenderContext {
  currentUser: CurrentUser | null;
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

function renderErrorPage(message: string): string {
  return `<div data-testid="server-error"><h1>Server Error</h1><p>${message}</p></div>`;
}

export async function render(
  url: string,
  context: RenderContext,
): Promise<RenderResult> {
  const router = cloneRouter(baseRouter, {
    currentUser: context.currentUser,
  });

  router.usePlugin(ssrDataPluginFactory(loaders));

  try {
    const state = await router.start(url);
    const statusCode = state.name === UNKNOWN_ROUTE ? 404 : 200;

    const app = createSSRApp({
      render: () => h(RouterProvider, { router }, { default: () => h(App) }),
    });

    const html = await renderToString(app);

    return {
      html,
      serializedData: wrapInScript(serializeRouterState(state)),
      statusCode,
      redirect: null,
    };
  } catch (error) {
    const code = (error as { code?: string }).code;

    if (code === "CANNOT_ACTIVATE") {
      return { html: "", serializedData: "", statusCode: 302, redirect: "/" };
    }

    const message = error instanceof Error ? error.message : "Unknown error";

    return {
      html: renderErrorPage(message),
      serializedData: "",
      statusCode: 500,
      redirect: null,
    };
  } finally {
    router.dispose();
  }
}
