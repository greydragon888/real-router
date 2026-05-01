import { renderToReadableStream as renderRscToReadableStream } from "@vitejs/plugin-rsc/rsc";

import { HelloWorld } from "./HelloWorld";

async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/__rsc") {
    const route = url.searchParams.get("route") ?? "/";
    const flightStream = renderRscToReadableStream(<HelloWorld route={route} />);

    return new Response(flightStream, {
      status: 200,
      headers: { "Content-Type": "text/x-component" },
    });
  }

  const flightStream = renderRscToReadableStream(
    <HelloWorld route={url.pathname} />,
  );

  const ssr = await import.meta.viteRsc.loadModule<
    typeof import("./entry.ssr")
  >("ssr", "index");

  return ssr.renderHTML(flightStream, url.pathname);
}

export default { fetch: handler };
