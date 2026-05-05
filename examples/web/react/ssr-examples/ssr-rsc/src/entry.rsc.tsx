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
    const code = (error as { code?: string } | null)?.code;

    // Typed loader errors → plain-text Response with the right HTTP
    // status. router.dispose() runs in the finally block so no leak
    // regardless of which path we took.
    if (code === "LOADER_NOT_FOUND") {
      return new Response("Not Found", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    if (code === "LOADER_REDIRECT") {
      const redirect = error as { target?: string; status?: number };

      return new Response(null, {
        status: redirect.status ?? 302,
        headers: { Location: redirect.target ?? "/" },
      });
    }

    // Loader rejection → 500 + Server Component error page (no Flight, plain HTML).
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

export default { fetch: handler };
