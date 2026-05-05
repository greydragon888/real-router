import { hydrateRouter } from "@real-router/core/utils";
import { createFromReadableStream } from "@vitejs/plugin-rsc/ssr";
import { renderToReadableStream } from "react-dom/server.edge";
import { injectRSCPayload } from "rsc-html-stream/server";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";

import type { ReactFormState } from "react-dom/client";
import type { ReactNode } from "react";

// Mirrors the rscPayload shape produced by entry.rsc.tsx. After
// adding Server Actions, the Flight payload is no longer a bare
// ReactNode but an object: `{ root, returnValue?, formState? }`.
// The SSR pipeline reads `root` as the React tree to render.
interface RscPayload {
  root: ReactNode;
  returnValue?: { ok: boolean; data: unknown };
  formState?: ReactFormState;
}

interface RenderHTMLOptions {
  ssrState: string;
  statusCode: number;
}

export async function renderHTML(
  rscStream: ReadableStream<Uint8Array>,
  { ssrState, statusCode }: RenderHTMLOptions,
): Promise<Response> {
  const [flightForSsr, flightForBrowser] = rscStream.tee();
  const payload = createFromReadableStream<RscPayload>(flightForSsr);

  const router = createAppRouter();

  await hydrateRouter(router, ssrState);

  const clientBootstrap = await import.meta.viteRsc.loadBootstrapScriptContent(
    "index",
  );

  const htmlStream = await renderToReadableStream(
    <App router={router} payload={payload} />,
    {
      bootstrapScriptContent: `window.__SSR_STATE__=${ssrState};\n${clientBootstrap}`,
    },
  );

  const finalStream = htmlStream.pipeThrough(
    injectRSCPayload(flightForBrowser),
  );

  router.dispose();

  return new Response(finalStream, {
    status: statusCode,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
