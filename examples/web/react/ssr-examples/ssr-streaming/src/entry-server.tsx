import { UNKNOWN_ROUTE } from "@real-router/core";
import {
  createRequestScope,
  serializeRouterState,
  type IncomingMessageLike,
} from "@real-router/ssr-utils";
import { RouterProvider } from "@real-router/react";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import {
  getDeferBootstrapScript,
  injectDeferredScripts,
} from "@real-router/ssr-data-plugin/server";
import { renderToReadableStream } from "react-dom/server";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

const baseRouter = createAppRouter();

export interface RenderContext {
  req: IncomingMessageLike;
}

export interface RenderResult {
  /** Streaming HTML pipeline. Absent when a typed loader error
   * short-circuits to a plain-text response (see rawBody). */
  stream?: ReadableStream<Uint8Array>;
  ssrJson: string;
  statusCode: number;
  /** AbortSignal tied to request close — pump loop breaks early on
   * client disconnect without buffering the rest of the stream. */
  signal: AbortSignal;
  cleanup: () => Promise<void>;
  /** Pre-rendered body that bypasses the streaming pipeline — used
   * for typed loader errors (LoaderNotFound) that surface as
   * text/plain HTTP responses. */
  rawBody?: string;
  /** Optional Content-Type override for rawBody responses. */
  contentType?: string;
  /** Inline `<script>` that installs the `__rrDeferRegistry__` + `__rrDefer__`
   * functions before any settle script lands in the body. Empty string when
   * the route has no deferred promises. Server inserts in `<head>` via
   * `<!--defer-bootstrap-->` template substitution. */
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
  // createRequestScope: AbortController + req.on("close") + cloneRouter +
  // dispose, all in one. Cannot use `await using` here — the cloned
  // router must outlive this function for the streaming pipeline; instead
  // we hand `cleanup` (alias of scope.dispose) back to the server.
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

  // Strip live promises from the JSON state — they don't survive
  // serialization. The deferred KEYS list (`ssrDataDeferredKeys`) IS shipped
  // so the client-side plugin can reconstruct registry-backed promises after
  // hydration. The ssrDataDeferred Map values are recovered from the inline
  // <script>__rrDefer__("key", json)</script> tags injected by
  // `injectDeferredScripts` below.
  const ssrJson = serializeRouterState(state, {
    excludeContext: ["ssrDataDeferred"],
  });

  const reactStream = await renderToReadableStream(
    <RouterProvider router={scope.router}>
      <App />
    </RouterProvider>,
    {
      onError(error: unknown) {
        console.error("[ssr] render error:", error);
      },
    },
  );

  const deferredMap =
    (state.context as { ssrDataDeferred?: Record<string, Promise<unknown>> })
      .ssrDataDeferred ?? {};
  const hasDeferred = Object.keys(deferredMap).length > 0;

  // Bootstrap goes in <head> (template substitution) so React's hydration
  // sees the pristine #root subtree it expects. The settle scripts emitted
  // by injectDeferredScripts during the body stream are tolerated by React
  // the same way as its own runtime instrumentation (`$RC`, `$RV`, etc.).
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
