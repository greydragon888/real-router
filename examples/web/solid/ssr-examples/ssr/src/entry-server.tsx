import {
  createRequestScope,
  serializeRouterState,
  type IncomingMessageLike,
} from "@real-router/ssr-utils";
import { RouterProvider } from "@real-router/solid";
import {
  HttpStatusProvider,
  createHttpStatusSink,
} from "@real-router/solid/ssr";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { generateHydrationScript, renderToStringAsync } from "solid-js/web";

import { App } from "./App";
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
  hydrationScript: string;
  serializedData: string;
  statusCode: number;
  redirect: string | null;
  /** Pre-rendered <head> markup (title + meta tags). Spliced into the
   * <!--ssr-head--> placeholder by server/index.ts. */
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
  // `<HttpStatusCode code={404}/>` which writes through `<HttpStatusProvider>`
  // into this sink during render. After `renderToStringAsync` completes we
  // read `sink.code ?? 200` and apply it to the response — render-time
  // decision (vs. inspecting `state.name === UNKNOWN_ROUTE` server-side).
  const httpStatusSink = createHttpStatusSink();

  try {
    const state = await scope.router.start(url);

    // `renderToStringAsync` is the third Solid SSR mode (alongside
    // sync `renderToString` and streaming `renderToStream`). It awaits
    // every <Suspense> inside the tree before returning, then yields a
    // single buffered HTML string. Pages without <Suspense> behave
    // identically to `renderToString` (resolved immediately). Pages
    // with <Suspense> + `createResource` (e.g. /async-page) hold the
    // response until their resource resolves — useful for CDN-cacheable
    // async pages where you don't need progressive chunked delivery.
    // Server-side head is set via the manual `<!--ssr-head-->`
    // placeholder (see `renderHeadFor(meta)` below). `@solidjs/meta`
    // would be the canonical pattern, but its `useAssets`-based
    // injection is unreliable for `renderToStringAsync` on Solid 1.9.5
    // — see `components/AutoMeta.tsx` for the full disclaimer.
    const html = await renderToStringAsync(() => (
      <HttpStatusProvider sink={httpStatusSink}>
        <RouterProvider router={scope.router}>
          <App />
        </RouterProvider>
      </HttpStatusProvider>
    ));

    const statusCode = httpStatusSink.code ?? 200;

    const meta = getMetaForState({
      name: state.name,
      params: state.params as Record<string, unknown>,
      search: state.search as Record<string, unknown>,
    });

    return {
      html,
      hydrationScript: generateHydrationScript(),
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
        hydrationScript: "",
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
        hydrationScript: "",
        serializedData: "",
        statusCode: redirect.status ?? 302,
        redirect: redirect.target ?? "/",
        head: "",
      };
    }

    if (code === "LOADER_NOT_FOUND") {
      return {
        html: "",
        hydrationScript: "",
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
        hydrationScript: "",
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
      hydrationScript: "",
      serializedData: "",
      statusCode: 500,
      redirect: null,
      head: "",
    };
  } finally {
    await scope.dispose();
  }
}
