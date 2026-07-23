import {
  createRequestScope,
  serializeRouterState,
  type IncomingMessageLike,
} from "@real-router/ssr-utils";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { RouterProvider } from "@real-router/vue";
import {
  HttpStatusProvider,
  createHttpStatusSink,
} from "@real-router/vue/ssr";
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
  /** Per-request handle. `createRequestScope` wires `AbortSignal` to its
   * `"close"` event so loaders can `getDep("abortSignal")` and cancel
   * pending work as soon as the client disconnects. */
  req: IncomingMessageLike;
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
  // createRequestScope: AbortController + req.on("close") + cloneRouter +
  // dispose, all in one. abortSignal is injected into deps so loaders can
  // read getDep("abortSignal"). Explicit try/finally + await scope.dispose()
  // is used (instead of `await using`) for compatibility with Node 22 LTS,
  // where Symbol.asyncDispose is not yet a well-known symbol — see
  // @real-router/ssr-utils/createRequestScope JSDoc for the runtime matrix.
  const scope = createRequestScope(context.req, baseRouter, {
    currentUser: context.currentUser,
  });

  scope.router.usePlugin(ssrDataPluginFactory(loaders));

  // Per-request HTTP status sink. The NotFound page mounts
  // `<HttpStatusCode :code="404"/>` which writes through `<HttpStatusProvider>`
  // into this sink during render. After `renderToString` completes we read
  // `sink.code ?? 200` and apply it to the response — render-time decision
  // (vs. inspecting `state.name === UNKNOWN_ROUTE` server-side).
  const httpStatusSink = createHttpStatusSink();

  try {
    const state = await scope.router.start(url);

    const app = createSSRApp({
      render: () =>
        h(
          HttpStatusProvider,
          { sink: httpStatusSink },
          {
            default: () =>
              h(
                RouterProvider,
                { router: scope.router },
                { default: () => h(App) },
              ),
          },
        ),
    });

    // Register the same directive used by the client app so SSR
    // template references resolve. Vue skips directive hooks during
    // SSR — the registration only prevents "Failed to resolve
    // directive" warnings while keeping zero server-side overhead.
    app.directive("track-view", trackView);

    const html = await renderToString(app);

    const statusCode = httpStatusSink.code ?? 200;

    const meta = getMetaForState({
      name: state.name,
      params: state.params as Record<string, unknown>,
      search: state.search as Record<string, unknown>,
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
    await scope.dispose();
  }
}
