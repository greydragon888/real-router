import { UNKNOWN_ROUTE } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { serializeRouterState } from "@real-router/core/utils";
import { RouterProvider } from "@real-router/preact";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { renderToReadableStream } from "preact-render-to-string/stream";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

const baseRouter = createAppRouter();

export interface RenderResult {
  /** Streaming HTML pipeline. Absent when a typed loader error
   * short-circuits to a plain-text response (see rawBody). */
  stream?: ReadableStream<Uint8Array>;
  ssrJson: string;
  statusCode: number;
  cleanup: () => void;
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

export async function render(url: string): Promise<RenderResult> {
  const router = cloneRouter(baseRouter);

  router.usePlugin(ssrDataPluginFactory(loaders));

  // Critical-data resolution can throw typed loader errors. Map them
  // BEFORE constructing the stream so cleanup runs on every path.
  let state;
  try {
    state = await router.start(url);
  } catch (error) {
    const code = readErrorCode(error);

    if (code === "LOADER_NOT_FOUND") {
      return {
        ssrJson: "{}",
        statusCode: 404,
        cleanup: () => router.dispose(),
        rawBody: "Not Found",
        contentType: "text/plain; charset=utf-8",
      };
    }

    router.dispose();
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
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
  );

  return {
    stream,
    ssrJson,
    statusCode,
    cleanup: () => {
      router.dispose();
    },
  };
}
