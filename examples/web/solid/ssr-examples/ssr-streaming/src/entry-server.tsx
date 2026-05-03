import { UNKNOWN_ROUTE } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { serializeRouterState } from "@real-router/core/utils";
import { RouterProvider } from "@real-router/solid";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { generateHydrationScript, renderToStream } from "solid-js/web";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

const baseRouter = createAppRouter();

export interface RenderResult {
  stream: ReadableStream<Uint8Array>;
  ssrJson: string;
  hydrationScript: string;
  statusCode: number;
  cleanup: () => void;
}

export async function render(url: string): Promise<RenderResult> {
  const router = cloneRouter(baseRouter);

  router.usePlugin(ssrDataPluginFactory(loaders));

  const state = await router.start(url);
  const ssrJson = serializeRouterState(state);
  const statusCode = state.name === UNKNOWN_ROUTE ? 404 : 200;
  const hydrationScript = generateHydrationScript();

  // Adapt Solid `pipe(NodeWritable)` (Node-shape sink: { write(chunk: string) })
  // into a Web ReadableStream<Uint8Array> so the Express server can consume it
  // via getReader() — same shape as Vue's renderToWebStream output. Direct
  // `pipeTo(WritableStream)` would force a Readable.fromWeb bridge round-trip.
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  let disposed = false;
  const cleanup = (): void => {
    if (disposed) return;
    disposed = true;
    router.dispose();
  };

  const { pipe } = renderToStream(
    () => (
      <RouterProvider router={router}>
        <App />
      </RouterProvider>
    ),
    {
      // Fires when ALL Suspense boundaries resolve — close writer here so
      // server's getReader() loop terminates naturally. The caller's
      // `finally { cleanup() }` is then idempotent via the `disposed` guard.
      onCompleteAll: () => {
        writer.close().catch(() => {});
        cleanup();
      },
    },
  );

  // Solid's `pipe()` calls `writable.write(chunk)` for every emitted string
  // and `writable.end()` once internal `onDone` fires (after the final
  // resource resolves). Both hooks must be present — without `end()` the
  // server crashes with "writable.end is not a function" after the last
  // chunk. Cast required because Solid's exposed TS surface narrows the
  // writable to `{ write }`.
  pipe({
    write: (chunk: string) => {
      writer.write(encoder.encode(chunk)).catch(() => {});
    },
    end: () => {
      writer.close().catch(() => {});
    },
  } as { write: (v: string) => void });

  return { stream: readable, ssrJson, hydrationScript, statusCode, cleanup };
}
