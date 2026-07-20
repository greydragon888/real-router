import { UNKNOWN_ROUTE } from "@real-router/core";
import {
  createRequestScope,
  serializeRouterState,
  type IncomingMessageLike,
} from "@real-router/ssr-utils";
import { RouterProvider } from "@real-router/solid";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { generateHydrationScript, renderToStream } from "solid-js/web";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

const baseRouter = createAppRouter();

export interface RenderContext {
  req: IncomingMessageLike;
}

export interface RenderResult {
  stream: ReadableStream<Uint8Array>;
  ssrJson: string;
  hydrationScript: string;
  statusCode: number;
  /** AbortSignal tied to request close — pump loop breaks early on
   * client disconnect without buffering the rest of the stream. */
  signal: AbortSignal;
  cleanup: () => Promise<void>;
  /** Pre-rendered body that bypasses the streaming pipeline — used for
   * typed loader errors (LoaderNotFound) that surface as plain-text HTTP
   * responses. When set, server/index.ts skips the stream branch. */
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

function emptyStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
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
      await scope.dispose();

      return {
        stream: emptyStream(),
        ssrJson: "",
        hydrationScript: "",
        statusCode: 404,
        signal: scope.signal,
        cleanup: async () => {},
        rawBody: "Not Found",
        contentType: "text/plain; charset=utf-8",
      };
    }

    await scope.dispose();

    throw error;
  }

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

  const cleanup = (): Promise<void> => scope.dispose();

  const { pipe } = renderToStream(
    () => (
      <RouterProvider router={scope.router}>
        <App />
      </RouterProvider>
    ),
    {
      // Fires when ALL Suspense boundaries resolve — close writer here so
      // server's getReader() loop terminates naturally. The caller's
      // `finally { await cleanup() }` is then idempotent via scope's
      // internal `disposed` guard.
      onCompleteAll: () => {
        writer.close().catch(() => {});
        void scope.dispose();
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

  return {
    stream: readable,
    ssrJson,
    hydrationScript,
    statusCode,
    signal: scope.signal,
    cleanup,
  };
}
