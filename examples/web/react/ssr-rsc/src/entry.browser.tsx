import { browserPluginFactory } from "@real-router/browser-plugin";
import { hydrateRouter } from "@real-router/core/utils";
import { createFromReadableStream } from "@vitejs/plugin-rsc/browser";
import { hydrateRoot } from "react-dom/client";
import { rscStream } from "rsc-html-stream/client";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";

import type { ReactNode } from "react";

declare global {
  var __SSR_STATE__: { path: string } | undefined;
}

const router = createAppRouter();

router.usePlugin(browserPluginFactory());

const ssrState = globalThis.__SSR_STATE__;

await (ssrState ? hydrateRouter(router, ssrState) : router.start());

const initialPayload = createFromReadableStream<ReactNode>(
  rscStream as ReadableStream<Uint8Array>,
);

hydrateRoot(document, <App router={router} payload={initialPayload} />);
