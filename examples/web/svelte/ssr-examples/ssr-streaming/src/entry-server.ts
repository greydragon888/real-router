import { UNKNOWN_ROUTE } from "@real-router/core";
import {
  createRequestScope,
  serializeRouterState,
  type IncomingMessageLike,
} from "@real-router/ssr-utils";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { render } from "svelte/server";

import App from "./App.svelte";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

const baseRouter = createAppRouter();

export interface RenderContext {
  req: IncomingMessageLike;
}

export interface RenderResult {
  html: string;
  head: string;
  ssrJson: string;
  statusCode: number;
  /** Pre-rendered body that bypasses the App template. Used for typed loader errors. */
  rawBody?: string;
  /** Optional Content-Type override for rawBody responses. */
  contentType?: string;
}

interface MaybeError {
  code?: string;
}

function readErrorCode(error: unknown): string | undefined {
  return (error as MaybeError | null)?.code;
}

export async function renderPage(
  url: string,
  context: RenderContext,
): Promise<RenderResult> {
  // Explicit try/finally + await scope.dispose() (instead of `await using`)
  // for compatibility with Node 22 LTS — see core JSDoc for the runtime
  // matrix.
  const scope = createRequestScope(context.req, baseRouter);

  scope.router.usePlugin(ssrDataPluginFactory(loaders));

  try {
    const state = await scope.router.start(url);
    const statusCode = state.name === UNKNOWN_ROUTE ? 404 : 200;

    // `await render(...)` covers both sync components and components with
    // top-level `await` / `<svelte:boundary pending>`. Svelte 5
    // RenderOutput is `SyncRenderOutput & PromiseLike<SyncRenderOutput>`,
    // so awaiting is safe even when no async work is happening.
    const { head, body } = await render(App, {
      props: { router: scope.router },
    });

    return {
      html: body,
      head,
      ssrJson: serializeRouterState(state),
      statusCode,
    };
  } catch (error) {
    const code = readErrorCode(error);

    if (code === "LOADER_NOT_FOUND") {
      return {
        html: "",
        head: "",
        ssrJson: "",
        statusCode: 404,
        rawBody: "Not Found",
        contentType: "text/plain; charset=utf-8",
      };
    }

    throw error;
  } finally {
    await scope.dispose();
  }
}
