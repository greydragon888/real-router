"use client";

import { type RscPayload } from "@real-router/rsc-server-plugin";
import { createFromReadableStream } from "@vitejs/plugin-rsc/browser";
import { startTransition, use, useEffect, useState } from "react";

import { Layout } from "./client-components/Layout";

import type { Router } from "@real-router/core";
import type { ReactNode } from "react";
import type { ReactFormState } from "react-dom/client";

// Canonical Flight payload type from @real-router/rsc-server-plugin.
// Same shape as entry.rsc.tsx (producer) and entry.ssr.tsx / entry.browser.tsx.
type AppPayload = RscPayload<unknown, ReactFormState>;

interface AppProps {
  readonly router: Router;
  readonly payload: Promise<AppPayload>;
}

export function App({ router, payload }: AppProps): ReactNode {
  const initial = use(payload);
  const [node, setNode] = useState<ReactNode>(initial.root);

  useEffect(() => {
    // Abort the previous in-flight Flight request when navigation changes.
    // Prevents the stale-response-wins race when the user clicks Link A,
    // then immediately Link B before A's fetch resolves: A would set the
    // node last, displaying the wrong route.
    let activeController: AbortController | null = null;

    const unsubscribe = router.subscribe(({ route }) => {
      activeController?.abort();

      const controller = new AbortController();

      activeController = controller;

      fetch(`/__rsc?route=${encodeURIComponent(route.path)}`, {
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.body) {
            throw new Error("RSC response missing body");
          }
          if (!response.ok) {
            console.warn(`[App] /__rsc returned ${response.status}`);
          }

          return createFromReadableStream<AppPayload>(response.body);
        })
        .then((newPayload) => {
          if (controller.signal.aborted) {
            return;
          }

          startTransition(() => {
            setNode(newPayload.root);
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          console.error("[App] /__rsc fetch failed:", error);
        });
    });

    return () => {
      activeController?.abort();
      unsubscribe();
    };
  }, [router]);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>real-router RSC example</title>
      </head>
      <body>
        <div id="root">
          <Layout router={router}>{node}</Layout>
        </div>
      </body>
    </html>
  );
}
