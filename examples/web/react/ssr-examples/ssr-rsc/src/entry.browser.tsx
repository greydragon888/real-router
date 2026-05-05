import { browserPluginFactory } from "@real-router/browser-plugin";
import { hydrateRouter } from "@real-router/core/utils";
import { type RscPayload } from "@real-router/rsc-server-plugin";
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

// `setServerCallback` registers the runtime React 19 uses when it
// encounters a server-action call from the hydrated tree. The
// callback receives (id, args) — we POST them to the current route
// with the action id in `x-rsc-action` so entry.rsc.tsx dispatches
// via `loadServerAction` + `decodeReply`. The response is a fresh
// Flight payload including `returnValue`/`formState`; React threads
// them back into useActionState.
setServerCallback(async (id: string, args: unknown[]) => {
  const url = new URL(window.location.href);
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

  return newPayload.returnValue?.data;
});

const initialPayload = createFromReadableStream<AppPayload>(
  rscStream as ReadableStream<Uint8Array>,
);

hydrateRoot(document, <App router={router} payload={initialPayload} />);
