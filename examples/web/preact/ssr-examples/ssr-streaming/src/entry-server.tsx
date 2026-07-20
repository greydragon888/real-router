import { UNKNOWN_ROUTE } from "@real-router/core";
import {
  createRequestScope,
  serializeRouterState,
  type IncomingMessageLike,
} from "@real-router/ssr-utils";
import { RouterProvider } from "@real-router/preact";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import {
  getDeferBootstrapScript,
  injectDeferredScripts,
} from "@real-router/ssr-data-plugin/server";
import { renderToReadableStream } from "preact-render-to-string/stream";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

const baseRouter = createAppRouter();

export interface RenderContext {
  req: IncomingMessageLike;
}

export interface RenderResult {
  stream?: ReadableStream<Uint8Array>;
  ssrJson: string;
  statusCode: number;
  signal: AbortSignal;
  cleanup: () => Promise<void>;
  rawBody?: string;
  contentType?: string;
  /** Inline `<script>` that installs the deferred-promise registry; embed in
   * `<head>` via `<!--defer-bootstrap-->` template substitution. Empty when
   * the route has no deferred data. */
  deferBootstrap: string;
}

interface MaybeError {
  code?: string;
}

function readErrorCode(error: unknown): string | undefined {
  return (error as MaybeError | null)?.code;
}

export async function render(
  url: string,
  context: RenderContext,
): Promise<RenderResult> {
  const scope = createRequestScope(context.req, baseRouter);

  scope.router.usePlugin(ssrDataPluginFactory(loaders));

  let state;

  try {
    state = await scope.router.start(url);
  } catch (error) {
    const code = readErrorCode(error);

    if (code === "LOADER_NOT_FOUND") {
      return {
        ssrJson: "{}",
        statusCode: 404,
        signal: scope.signal,
        cleanup: () => scope.dispose(),
        rawBody: "Not Found",
        contentType: "text/plain; charset=utf-8",
        deferBootstrap: "",
      };
    }

    await scope.dispose();

    throw error;
  }

  const statusCode = state.name === UNKNOWN_ROUTE ? 404 : 200;

  // Strip live promises from the JSON state.
  const ssrJson = serializeRouterState(state, {
    excludeContext: ["ssrDataDeferred"],
  });

  const reactStream = renderToReadableStream(
    <RouterProvider router={scope.router}>
      <App />
    </RouterProvider>,
  );

  const deferredMap =
    (state.context as { ssrDataDeferred?: Record<string, Promise<unknown>> })
      .ssrDataDeferred ?? {};
  const hasDeferred = Object.keys(deferredMap).length > 0;

  const stream = injectDeferredScripts(reactStream, deferredMap, {
    bootstrap: false,
  });
  const deferBootstrap = hasDeferred
    ? `<script>${getDeferBootstrapScript()}</script>`
    : "";

  return {
    stream,
    ssrJson,
    statusCode,
    signal: scope.signal,
    cleanup: () => scope.dispose(),
    deferBootstrap,
  };
}
