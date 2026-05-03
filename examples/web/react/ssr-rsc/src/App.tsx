"use client";

import { createFromReadableStream } from "@vitejs/plugin-rsc/browser";
import { startTransition, use, useEffect, useState } from "react";

import { Layout } from "./client-components/Layout";

import type { Router } from "@real-router/core";
import type { ReactNode } from "react";

interface AppProps {
  readonly router: Router;
  readonly payload: Promise<ReactNode>;
}

export function App({ router, payload }: AppProps): ReactNode {
  const initialNode = use(payload);
  const [node, setNode] = useState<ReactNode>(initialNode);

  useEffect(() => {
    return router.subscribe(({ route }) => {
      fetch(`/__rsc?route=${encodeURIComponent(route.path)}`)
        .then((response) => {
          if (!response.body) {
            throw new Error("RSC response missing body");
          }
          if (!response.ok) {
            console.warn(`[App] /__rsc returned ${response.status}`);
          }

          return createFromReadableStream<ReactNode>(response.body);
        })
        .then((newNode) => {
          startTransition(() => {
            setNode(newNode);
          });
        })
        .catch((error: unknown) => {
          console.error("[App] /__rsc fetch failed:", error);
        });
    });
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
