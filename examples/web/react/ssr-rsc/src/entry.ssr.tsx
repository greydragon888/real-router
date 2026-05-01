import { createFromReadableStream } from "@vitejs/plugin-rsc/ssr";
import { renderToReadableStream } from "react-dom/server.edge";
import { injectRSCPayload } from "rsc-html-stream/server";
import type { ReactNode } from "react";

import { App } from "./App";
import { createAppRouter } from "./createAppRouter";

export async function renderHTML(
  rscStream: ReadableStream<Uint8Array>,
  pathname: string,
): Promise<Response> {
  const [flightForSsr, flightForBrowser] = rscStream.tee();
  const payload = createFromReadableStream<ReactNode>(flightForSsr);

  const router = createAppRouter();
  await router.start(pathname);

  const htmlStream = await renderToReadableStream(
    <App router={router} payload={payload} />,
    {
      bootstrapModules: ["/src/entry.browser.tsx"],
      bootstrapScriptContent: `window.__SSR_STATE__=${JSON.stringify({ path: pathname })}`,
    },
  );

  const finalStream = htmlStream.pipeThrough(injectRSCPayload(flightForBrowser));

  router.dispose();

  return new Response(finalStream, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
