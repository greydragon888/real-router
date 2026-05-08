import { UNKNOWN_ROUTE } from "@real-router/core";
import {
  createRequestScope,
  serializeRouterState,
  type IncomingMessageLike,
} from "@real-router/core/utils";
import { RouterProvider } from "@real-router/preact";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { renderToReadableStream } from "preact-render-to-string/stream";

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

  // Critical-data resolution can throw typed loader errors. Map them
  // BEFORE constructing the stream so cleanup runs on every path.
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
      };
    }

    await scope.dispose();

    throw error;
  }

  const statusCode = state.name === UNKNOWN_ROUTE ? 404 : 200;

  const ssrJson = serializeRouterState(state);

  // preact-render-to-string@6.5+ exposes Web-Streams `renderToReadableStream`
  // (and a Node-Streams `renderToPipeableStream` from the same subpath).
  // Async function components inside <Suspense> resolve out-of-order in
  // theory, but Preact v10 docs note v10 hydration can pause and wait
  // for JS chunks (true selective hydration lands in v11). For v10, the
  // wire signature is shell + fallback markers + resolved chunks in
  // resolution order — see e2e tests for the empirical proof.
  const stream = renderToReadableStream(
    <RouterProvider router={scope.router}>
      <App />
    </RouterProvider>,
  );

  return {
    stream,
    ssrJson,
    statusCode,
    signal: scope.signal,
    cleanup: () => scope.dispose(),
  };
}
