import { hydrateRouter } from "@real-router/ssr-utils";
import { createFromReadableStream } from "@vitejs/plugin-rsc/ssr";
import { renderToReadableStream } from "react-dom/server.edge";
import { injectRSCPayload } from "rsc-html-stream/server";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";

import type { RscPayload } from "@real-router/rsc-server-plugin";
import type { ReactFormState } from "react-dom/client";

// `RscPayload<TReturn, TFormState>` from @real-router/rsc-server-plugin
// is the canonical Flight payload shape. Same type used in
// entry.rsc.tsx (producer), App.tsx + entry.browser.tsx (consumers).
type AppPayload = RscPayload<unknown, ReactFormState>;

interface RenderHTMLOptions {
  ssrState: string;
  statusCode: number;
}

export async function renderHTML(
  rscStream: ReadableStream<Uint8Array>,
  { ssrState, statusCode }: RenderHTMLOptions,
): Promise<Response> {
  const [flightForSsr, flightForBrowser] = rscStream.tee();
  const payload = createFromReadableStream<AppPayload>(flightForSsr);

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
