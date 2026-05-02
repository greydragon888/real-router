import { browserPluginFactory } from "@real-router/browser-plugin";
import { hydrateRouter } from "@real-router/core/utils";
import { createFromReadableStream } from "@vitejs/plugin-rsc/browser";
import { hydrateRoot } from "react-dom/client";
import { rscStream } from "rsc-html-stream/client";
import type { ReactNode } from "react";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";

declare global {
  interface Window {
    __SSR_STATE__?: { path: string };
  }
}

const router = createAppRouter();
router.usePlugin(browserPluginFactory());

const ssrState = window.__SSR_STATE__;
if (ssrState) {
  await hydrateRouter(router, ssrState);
} else {
  await router.start();
}

const initialPayload = createFromReadableStream<ReactNode>(rscStream);

hydrateRoot(document, <App router={router} payload={initialPayload} />);
