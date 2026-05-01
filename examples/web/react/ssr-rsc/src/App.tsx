"use client";

import { use } from "react";
import type { ReactNode } from "react";
import type { Router } from "@real-router/core";
import { RouterProvider } from "@real-router/react";

interface AppProps {
  router: Router;
  payload: Promise<ReactNode>;
}

export function App({ router, payload }: AppProps) {
  const node = use(payload);

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>real-router RSC example</title>
      </head>
      <body>
        <div id="root">
          <RouterProvider router={router}>{node}</RouterProvider>
        </div>
      </body>
    </html>
  );
}
