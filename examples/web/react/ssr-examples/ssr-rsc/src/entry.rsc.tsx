import { UNKNOWN_ROUTE } from "@real-router/core";
import {
  createRequestScope,
  serializeRouterState,
} from "@real-router/ssr-utils";
import {
  rscActionPluginFactory,
  rscServerPluginFactory,
  type RscActionResult,
  type RscPayload,
} from "@real-router/rsc-server-plugin";
import {
  createTemporaryReferenceSet,
  decodeAction,
  decodeFormState,
  decodeReply,
  loadServerAction,
  renderToReadableStream as renderRscToReadableStream,
} from "@vitejs/plugin-rsc/rsc";

import { database } from "./database";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";
import { NotificationBanner } from "./server-components/NotificationBanner";

import type { ReactFormState } from "react-dom/client";

// Header used by `setServerCallback` (entry.browser.tsx) to send the
// id of the server action being invoked from the hydrated client. If
// absent on a POST, the request is a progressive-enhancement form
// submit (no JS) and `decodeAction(formData)` extracts the action
// from the FormData itself.
const HEADER_ACTION_ID = "x-rsc-action";

const baseRouter = createAppRouter();

async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // Stage 4 e2e test infrastructure: mutation endpoint for revalidation scenario.
  if (
    url.pathname.startsWith("/__test/users/") &&
    request.method === "POST" &&
    !request.headers.get(HEADER_ACTION_ID)
  ) {
    const id = url.pathname.slice("/__test/users/".length);
    const { email } = (await request.json()) as { email: string };

    database.users.setEmail(id, email);

    return new Response(null, { status: 204 });
  }

  // Server Action handling — runs BEFORE rendering so the new render
  // reflects the mutation (single round-trip mutate + fetch).
  let actionResult: RscActionResult<unknown, ReactFormState> | undefined;
  let temporaryReferences: unknown | undefined;
  let actionStatus: number | undefined;

  if (request.method === "POST") {
    const actionId = request.headers.get(HEADER_ACTION_ID);

    if (actionId) {
      // Hydrated-client path: action invoked via `setServerCallback`
      // with serialized args (FormData or text body). React passes
      // `(prevState, formData)` for `useActionState`-bound forms.
      const contentType = request.headers.get("content-type");
      const body = contentType?.startsWith("multipart/form-data")
        ? await request.formData()
        : await request.text();

      temporaryReferences = createTemporaryReferenceSet();

      const args = await decodeReply(body, { temporaryReferences });
      const action = await loadServerAction(actionId);

      try {
        const data = (await (action as (...a: unknown[]) => unknown).apply(
          null,
          args as unknown[],
        )) as unknown;

        actionResult = { returnValue: { ok: true, data } };
      } catch (error) {
        actionResult = { returnValue: { ok: false, data: error } };
        actionStatus = 500;
      }
    } else if (request.headers.get("content-type")?.includes("form")) {
      // Progressive-enhancement path: <form action={fn}> submitted
      // before hydration (or with JS disabled). React encodes the
      // server-action reference as a hidden form field; decodeAction
      // recovers it from the FormData.
      const formData = await request.formData();
      const decodedAction = await decodeAction(formData);

      try {
        const result = await decodedAction();
        const formState = await decodeFormState(result, formData);
        actionResult = { formState };
      } catch {
        return new Response("Internal Server Error: server action failed", {
          status: 500,
        });
      }
    }
  }

  const pathname =
    url.pathname === "/__rsc"
      ? (url.searchParams.get("route") ?? "/")
      : url.pathname + url.search;

  // Web Request shape — createRequestScope reads `request.signal` directly,
  // no req.on("close") wiring needed. abortSignal is injected into deps
  // for loaders that read getDep("abortSignal") (none today, but the
  // pattern is consistent with the Node-runtime adapters). Explicit
  // try/finally + await scope.dispose() is used (instead of `await using`)
  // for compatibility with Node 22 LTS — see core JSDoc for the runtime
  // matrix.
  const scope = createRequestScope(request, baseRouter, {
    db: database,
  });

  // Two complementary plugins:
  //   - rscServerPluginFactory → publishes the Server Component tree
  //     to state.context.rsc (per-route, via loaders).
  //   - rscActionPluginFactory → publishes the Server Action result
  //     (returnValue/formState) to state.context.rscAction. The
  //     result is captured above (in `actionResult`) before start();
  //     the plugin reads it from the closure during the start
  //     interceptor.
  scope.router.usePlugin(
    rscServerPluginFactory(loaders),
    rscActionPluginFactory(() => actionResult),
  );

  try {
    const state = await scope.router.start(pathname);
    const statusCode =
      actionStatus ?? (state.name === UNKNOWN_ROUTE ? 404 : 200);

    const rscNode = state.context.rsc ?? (
      <p data-testid="not-found">Not Found</p>
    );

    // Wrap the per-route Server Component tree with the global
    // NotificationBanner Server Component. The banner reads
    // state.context.rscAction (published by rscActionPluginFactory
    // when the request handled a Server Action) and renders
    // success/error feedback. For plain GET requests rscAction is
    // undefined — banner returns null.
    //
    // This wrapping pattern demonstrates A2's value: any Server
    // Component in the tree can react to mutation results without
    // prop-drilling from the form component. The form (Client) still
    // uses useActionState for its own per-form message; the banner
    // is the cross-cutting UX layer on top.
    const wrappedRoot = (
      <>
        <NotificationBanner action={state.context.rscAction} />
        {rscNode}
      </>
    );

    // RSC payload uses the canonical RscPayload<TReturn, TFormState>
    // type from @real-router/rsc-server-plugin — same shape consumed
    // by entry.ssr.tsx, App.tsx, and entry.browser.tsx. Single source
    // of truth for the wire format.
    const rscPayload: RscPayload<unknown, ReactFormState> = {
      root: wrappedRoot,
      returnValue: actionResult?.returnValue,
      formState: actionResult?.formState,
    };
    const flightStream = renderRscToReadableStream(rscPayload, {
      temporaryReferences,
    } as Record<string, unknown>);

    if (url.pathname === "/__rsc" || request.method === "POST") {
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

    const message = error instanceof Error ? error.message : "Unknown error";
    const html = `<!doctype html><html><body><div data-testid="server-error"><h1>Server Error</h1><p>${message}</p></div></body></html>`;

    return new Response(html, {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } finally {
    await scope.dispose();
  }
}

export default { fetch: handler };
