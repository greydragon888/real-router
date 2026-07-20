import { browserPluginFactory } from "@real-router/browser-plugin";
import { hydrateRouter } from "@real-router/ssr-utils";
import { RouterProvider } from "@real-router/preact";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { hydrate } from "preact";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

import type { CurrentUser } from "./entry-server";
import type {
  DataLoaderFactoryMap,
  DataLoaderFnFactory,
} from "@real-router/ssr-data-plugin";

declare global {
  var __SSR_STATE__: { path: string } | undefined;

  var __LOADER_CALLS__: Record<string, number> | undefined;
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

const loaderCalls: Record<string, number> = {};

globalThis.__LOADER_CALLS__ = loaderCalls;

const instrumentedLoaders: DataLoaderFactoryMap = Object.fromEntries(
  Object.entries(loaders).map(([name, raw]) => {
    // Per-route SSR mode (#597): non-function entries (`{ ssr: false }`,
    // `{ ssr: "data-only", loader: … }`) pass through as-is. Only the
    // function form needs the loader-call counter wrap.
    if (typeof raw !== "function") return [name, raw];

    const factory = raw as DataLoaderFnFactory;

    return [
      name,
      (r, getDep) => {
        const loader = factory(r, getDep);

        return (params) => {
          loaderCalls[name] = (loaderCalls[name] ?? 0) + 1;

          return loader(params);
        };
      },
    ];
  }),
) as DataLoaderFactoryMap;

router.usePlugin(
  browserPluginFactory(),
  ssrDataPluginFactory(instrumentedLoaders),
);

const ssrState = globalThis.__SSR_STATE__;

await (ssrState ? hydrateRouter(router, ssrState) : router.start());

const rootElement = document.querySelector("#root");

if (rootElement) {
  // Preact's `hydrate(vnode, parent)` reuses server-rendered DOM. Unlike
  // React's `hydrateRoot(container, vnode)`, parameter order is reversed
  // and there is no separate root object — pass the live element node.
  hydrate(
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
    rootElement,
  );
}
