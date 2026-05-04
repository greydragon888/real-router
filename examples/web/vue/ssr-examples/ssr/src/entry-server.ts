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

import type { CurrentUser } from "./_known-users";

const baseRouter = createAppRouter();

interface RenderContext {
  currentUser: CurrentUser | null;
  /** AbortSignal fired when the client disconnects mid-render. Loaders
   * can `getDep("abortSignal")` to cancel pending work and avoid
   * leaking server resources after the response is no longer wanted.
   * See /slow loader for the demonstrated pattern. */
  abortSignal?: AbortSignal;
}

export interface RenderResult {
  html: string;
  serializedData: string;
  statusCode: number;
  redirect: string | null;
  /** Pre-rendered body that bypasses the App template — used for typed
   * loader errors that surface as plain-text HTTP responses. */
  rawBody?: string;
  /** Optional Content-Type override for rawBody responses. */
  contentType?: string;
}

interface MaybeRedirect {
  code?: string;
  target?: string;
  status?: number;
}

interface MaybeError {
  code?: string;
}

function readErrorCode(error: unknown): string | undefined {
  return (error as MaybeError | null)?.code;
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
    // abortSignal is request-scoped: server/index.ts creates a fresh
    // AbortController per request and aborts on `req.on("close")`.
    // Loaders read it via `getDep("abortSignal")` to cancel async work.
    abortSignal: context.abortSignal,
  } as Record<string, unknown>);

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
    const code = readErrorCode(error);

    if (code === "CANNOT_ACTIVATE") {
      return {
        html: "",
        serializedData: "",
        statusCode: 302,
        redirect: "/",
      };
    }

    if (code === "LOADER_REDIRECT") {
      const redirect = error as MaybeRedirect;

      return {
        html: "",
        serializedData: "",
        statusCode: redirect.status ?? 302,
        redirect: redirect.target ?? "/",
      };
    }

    if (code === "LOADER_NOT_FOUND") {
      return {
        html: "",
        serializedData: "",
        statusCode: 404,
        redirect: null,
        rawBody: "Not Found",
        contentType: "text/plain; charset=utf-8",
      };
    }

    if (code === "LOADER_TIMEOUT") {
      return {
        html: "",
        serializedData: "",
        statusCode: 504,
        redirect: null,
        rawBody: "Gateway Timeout",
        contentType: "text/plain; charset=utf-8",
      };
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
