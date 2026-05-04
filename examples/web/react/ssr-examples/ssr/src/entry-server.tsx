import { UNKNOWN_ROUTE } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { serializeRouterState } from "@real-router/core/utils";
import { RouterProvider } from "@real-router/react";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { renderToString } from "react-dom/server";

import { App } from "./App";
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
  /** AbortSignal fired when the client disconnects mid-render. Loaders
   * can `getDep("abortSignal")` to cancel pending work and avoid
   * leaking server resources after the response is no longer wanted. */
  abortSignal?: AbortSignal;
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
    // abortSignal is request-scoped: server/index.ts creates a fresh
    // AbortController per request and aborts on `req.on("close")`.
    // Loaders read it via `getDep("abortSignal")` to cancel async work.
    abortSignal: context.abortSignal,
  } as Record<string, unknown>);

  router.usePlugin(ssrDataPluginFactory(loaders));

  try {
    const state = await router.start(url);
    const statusCode = state.name === UNKNOWN_ROUTE ? 404 : 200;

    const html = renderToString(
      <RouterProvider router={router}>
        <App />
      </RouterProvider>,
    );

    // Hydration payload (#563): full server-resolved State (incl.
    // state.context.data from ssr-data-plugin). Client passes it to
    // hydrateRouter, which extracts state.path and calls router.start(path) —
    // matchPath/forwardState/buildPath re-run on client; for URL-deterministic
    // interceptors the result matches the server snapshot.
    return {
      html,
      serializedData: wrapInScript(serializeRouterState(state)),
      statusCode,
      redirect: null,
    };
  } catch (error) {
    const code = (error as { code?: string }).code;

    // Auth-guard rejection → 302 to home (UX-correct, not really an error).
    if (code === "CANNOT_ACTIVATE") {
      return { html: "", serializedData: "", statusCode: 302, redirect: "/" };
    }

    // Real error path — bubble loader/route errors to a 500 + error UI.
    // Server-side, no reason to expose internal stack traces; client gets
    // a deterministic shape so e2e can assert on it.
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
