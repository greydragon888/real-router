import { UNKNOWN_ROUTE } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { serializeRouterState } from "@real-router/core/utils";
import { RouterProvider } from "@real-router/react";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { renderToReadableStream } from "react-dom/server";

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

  // Critical-data resolution can throw typed loader errors. Mapping
  // them at this layer avoids the leak in the previous design: a
  // generic throw bubbled past the streaming server's render() call
  // site, the catch block never knew about `cleanup`, and
  // router.dispose() was skipped — leaking the per-request router
  // until GC. By returning a RenderResult with rawBody + cleanup, the
  // server can react properly without the leak.
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

    // Unknown error — clean up before propagating so the express
    // middleware's catch handler doesn't have to know about cleanup.
    router.dispose();
    throw error;
  }

  const statusCode = state.name === UNKNOWN_ROUTE ? 404 : 200;

  const ssrJson = serializeRouterState(state);

  const stream = await renderToReadableStream(
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
    {
      onError(error: unknown) {
        console.error("[ssr] render error:", error);
      },
    },
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
