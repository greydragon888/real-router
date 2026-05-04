import { UNKNOWN_ROUTE } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { serializeRouterState } from "@real-router/core/utils";
import { RouterProvider } from "@real-router/vue";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";

import App from "./App.vue";
import { trackView } from "./directives/track-view";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";
import { getMetaForState, type PageMeta } from "./router/meta";

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
  /** Pre-rendered <head> markup (title + meta tags + canonical + og).
   * Spliced into the <!--ssr-meta--> placeholder by server/index.ts. */
  head: string;
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderHeadFor(meta: PageMeta): string {
  return [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.ogTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.ogDescription)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`,
  ].join("\n    ");
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

    // Register the same directive used by the client app so SSR
    // template references resolve. Vue skips directive hooks during
    // SSR — the registration only prevents "Failed to resolve
    // directive" warnings while keeping zero server-side overhead.
    app.directive("track-view", trackView);

    const html = await renderToString(app);

    const meta = getMetaForState({
      name: state.name,
      params: state.params as Record<string, unknown>,
    });

    return {
      html,
      serializedData: wrapInScript(serializeRouterState(state)),
      statusCode,
      redirect: null,
      head: renderHeadFor(meta),
    };
  } catch (error) {
    const code = readErrorCode(error);

    if (code === "CANNOT_ACTIVATE") {
      return {
        html: "",
        serializedData: "",
        statusCode: 302,
        redirect: "/",
        head: "",
      };
    }

    if (code === "LOADER_REDIRECT") {
      const redirect = error as MaybeRedirect;

      return {
        html: "",
        serializedData: "",
        statusCode: redirect.status ?? 302,
        redirect: redirect.target ?? "/",
        head: "",
      };
    }

    if (code === "LOADER_NOT_FOUND") {
      return {
        html: "",
        serializedData: "",
        statusCode: 404,
        redirect: null,
        head: "",
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
        head: "",
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
      head: "",
    };
  } finally {
    router.dispose();
  }
}
