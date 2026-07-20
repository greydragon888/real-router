import { browserPluginFactory } from "@real-router/browser-plugin";
import { hydrateRouter } from "@real-router/ssr-utils";
import {
  createFromFetch,
  createFromReadableStream,
  encodeReply,
  setServerCallback,
} from "@vitejs/plugin-rsc/browser";
import { hydrateRoot } from "react-dom/client";
import { rscStream } from "rsc-html-stream/client";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";

import type { RscPayload } from "@real-router/rsc-server-plugin";
import type { ReactFormState } from "react-dom/client";

// Canonical Flight payload type from @real-router/rsc-server-plugin.
// Same shape as entry.rsc.tsx (producer) and entry.ssr.tsx / App.tsx.
type AppPayload = RscPayload<unknown, ReactFormState>;

declare global {
  var __SSR_STATE__: { path: string } | undefined;
}

const router = createAppRouter();

router.usePlugin(browserPluginFactory());

const ssrState = globalThis.__SSR_STATE__;

await (ssrState ? hydrateRouter(router, ssrState) : router.start());

// Custom event used to ferry the post-action Flight payload from
// `setServerCallback` (this module) to the App component (which owns
// the rendered React tree state). Decouples the action transport
// from the tree-update mechanism without exposing setNode globally.
const SERVER_ACTION_RESPONSE_EVENT = "rsc:server-action-response";

// `setServerCallback` registers the runtime React 19 uses when it
// encounters a server-action call from the hydrated tree. The
// callback receives (id, args) — we POST them to the current route
// with the action id in `x-rsc-action` so entry.rsc.tsx dispatches
// via `loadServerAction` + `decodeReply`. The response is a fresh
// Flight payload including `returnValue`/`formState` AND the new
// `root` (Server Components re-rendered post-mutation, including
// e.g. NotificationBanner that reads state.context.rscAction).
//
// We dispatch a CustomEvent with the new payload so App.tsx can
// replace its tree state. Without this, the form's useActionState
// would update but the rest of the page (including any Server
// Component that reacts to rscAction) would stay stale until a
// manual reload.
setServerCallback(async (id: string, args: unknown[]) => {
  const url = new URL(globalThis.location.href);
  const body = await encodeReply(args);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "x-rsc-action": id,
      ...(typeof body === "string"
        ? { "content-type": "text/plain;charset=utf-8" }
        : {}),
    },
    body,
  });

  if (!response.body) {
    throw new Error("Server-action response missing body");
  }

  const newPayload = await createFromFetch<AppPayload>(
    Promise.resolve(response),
  );

  globalThis.dispatchEvent(
    new CustomEvent<AppPayload>(SERVER_ACTION_RESPONSE_EVENT, {
      detail: newPayload,
    }),
  );

  return newPayload.returnValue?.data;
});

const initialPayload = createFromReadableStream<AppPayload>(
  rscStream as ReadableStream<Uint8Array>,
);

hydrateRoot(document, <App router={router} payload={initialPayload} />);
