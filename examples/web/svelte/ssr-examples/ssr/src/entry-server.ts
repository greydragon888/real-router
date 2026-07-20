import {
  createRequestScope,
  serializeRouterState,
  type IncomingMessageLike,
} from "@real-router/ssr-utils";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { createHttpStatusSink } from "@real-router/svelte/ssr";
import { render } from "svelte/server";

import App from "./App.svelte";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

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
  head: string;
  serializedData: string;
  statusCode: number;
  redirect: string | null;
  /** Pre-rendered body without going through the App template — used for typed loader errors that surface as plain-text HTTP responses. */
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

export async function renderPage(
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
  // (mounted by `App.svelte` when given a sink prop) into this sink during
  // render. After `render()` completes we read `sink.code ?? 200` and apply
  // it to the response — render-time decision (vs. inspecting
  // `state.name === UNKNOWN_ROUTE` server-side).
  const httpStatusSink = createHttpStatusSink();

  try {
    const state = await scope.router.start(url);

    // Svelte 5 RenderOutput is PromiseLike — `await` covers both sync
    // (no top-level await/no <svelte:boundary pending>) and async paths.
    const { head, body } = await render(App, {
      props: { router: scope.router, httpStatusSink },
    });

    const statusCode = httpStatusSink.code ?? 200;

    return {
      html: body,
      head,
      serializedData: wrapInScript(serializeRouterState(state)),
      statusCode,
      redirect: null,
    };
  } catch (error) {
    const code = readErrorCode(error);

    if (code === "CANNOT_ACTIVATE") {
      return {
        html: "",
        head: "",
        serializedData: "",
        statusCode: 302,
        redirect: "/",
      };
    }

    if (code === "LOADER_REDIRECT") {
      const redirect = error as MaybeRedirect;

      return {
        html: "",
        head: "",
        serializedData: "",
        statusCode: redirect.status ?? 302,
        redirect: redirect.target ?? "/",
      };
    }

    if (code === "LOADER_NOT_FOUND") {
      return {
        html: "",
        head: "",
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
        head: "",
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
      head: "",
      serializedData: "",
      statusCode: 500,
      redirect: null,
    };
  } finally {
    await scope.dispose();
  }
}
