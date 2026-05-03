import { UNKNOWN_ROUTE } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { serializeRouterState } from "@real-router/core/utils";
import { rscServerPluginFactory } from "@real-router/rsc-server-plugin";
import { renderToReadableStream as renderRscToReadableStream } from "@vitejs/plugin-rsc/rsc";

import { database } from "./database";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

const baseRouter = createAppRouter();

async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // Stage 4 e2e test infrastructure: mutation endpoint for revalidation scenario.
  // In a real app, gate behind admin auth or remove entirely — this is example-only.
  if (url.pathname.startsWith("/__test/users/") && request.method === "POST") {
    const id = url.pathname.slice("/__test/users/".length);
    const { email } = (await request.json()) as { email: string };

    database.users.setEmail(id, email);

    return new Response(null, { status: 204 });
  }

  const pathname =
    url.pathname === "/__rsc"
      ? (url.searchParams.get("route") ?? "/")
      : url.pathname + url.search;

  const router = cloneRouter(baseRouter, { db: database });

  router.usePlugin(rscServerPluginFactory(loaders));

  try {
    const state = await router.start(pathname);
    const statusCode = state.name === UNKNOWN_ROUTE ? 404 : 200;

    const rscNode = state.context.rsc ?? (
      <p data-testid="not-found">Not Found</p>
    );
    const flightStream = renderRscToReadableStream(rscNode);

    if (url.pathname === "/__rsc") {
      return new Response(flightStream, {
        status: statusCode,
        headers: { "Content-Type": "text/x-component" },
      });
    }

    const ssr = await import.meta.viteRsc.loadModule<
      typeof import("./entry.ssr")
    >("ssr", "index");

    return await ssr.renderHTML(flightStream, {
      ssrState: serializeRouterState(state, { excludeContext: ["rsc"] }),
      statusCode,
    });
  } catch (error) {
    // Loader rejection → 500 + Server Component error page (no Flight, plain HTML).
    // Caller can refine for specific routing-vs-loader error codes; for the
    // example we show a generic message.
    const message = error instanceof Error ? error.message : "Unknown error";
    const html = `<!doctype html><html><body><div data-testid="server-error"><h1>Server Error</h1><p>${message}</p></div></body></html>`;

    return new Response(html, {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } finally {
    router.dispose();
  }
}

// eslint-disable-next-line import-x/no-default-export -- @vitejs/plugin-rsc requires default export with `{ fetch }` shape
export default { fetch: handler };
