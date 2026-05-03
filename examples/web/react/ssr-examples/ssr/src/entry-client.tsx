import { browserPluginFactory } from "@real-router/browser-plugin";
import { hydrateRouter } from "@real-router/core/utils";
import { RouterProvider } from "@real-router/react";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { hydrateRoot } from "react-dom/client";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

import type { CurrentUser } from "./entry-server";

declare global {
  interface Window {
    __SSR_STATE__?: { path: string };
  }
}

// Mirrors server/_auth.ts: parse cookie → currentUser. Kept minimal because
// the client only needs the same DI value the server fed canActivate guards
// during SSR — otherwise post-hydration guard checks would diverge.
const KNOWN_USERS: Partial<Record<string, CurrentUser>> = {
  "1": { id: "1", name: "Alice", role: "admin" },
  "2": { id: "2", name: "Bob", role: "user" },
};

function getCurrentUserFromDocument(): CurrentUser | null {
  const cookies = Object.fromEntries(
    document.cookie
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const idx = p.indexOf("=");

        return idx === -1
          ? ([p, ""] as const)
          : ([p.slice(0, idx), p.slice(idx + 1)] as const);
      }),
  );

  const userId = cookies.userId;
  const user = userId ? KNOWN_USERS[userId] : undefined;

  if (user) {
    return user;
  }
  if (cookies.auth === "1") {
    return KNOWN_USERS["1"] ?? null;
  }

  return null;
}

const router = createAppRouter({
  currentUser: getCurrentUserFromDocument(),
});

router.usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders));

const ssrState = globalThis.__SSR_STATE__;

await (ssrState ? hydrateRouter(router, ssrState) : router.start());

const rootElement = document.querySelector("#root");

if (rootElement) {
  hydrateRoot(
    rootElement,
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
  );
}
