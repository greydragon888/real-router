import { api } from "../../../shared/api";
import { store } from "../../../shared/store";

import type { Params, Route } from "@real-router/core";

let controller: AbortController | null = null;

function abortPending(): void {
  if (controller) {
    controller.abort();
    controller = null;
  }
}

function loadData(
  routeName: string,
  fetcher: (signal: AbortSignal) => Promise<unknown>,
): void {
  abortPending();

  store.set(`${routeName}:loading`, true);
  store.set(`${routeName}:error`, null);

  controller = new AbortController();
  const { signal } = controller;

  void (async () => {
    try {
      const data = await fetcher(signal);

      if (!signal.aborted) {
        store.set(routeName, data);
        store.set(`${routeName}:loading`, false);
      }
    } catch (error: unknown) {
      if (!signal.aborted) {
        const message = error instanceof Error ? error.message : String(error);

        store.set(`${routeName}:error`, message);
        store.set(`${routeName}:loading`, false);
      }
    }
  })();
}

export const routes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "products",
    path: "/products",
    forwardTo: "products.list",
    children: [
      {
        name: "list",
        path: "/list",
        preload: async () => {
          const data = await api.getProducts();

          store.set("products.list", data);
        },
        onEnter: () => {
          loadData("products.list", (signal) => api.getProducts(signal));
        },
        onLeave: abortPending,
      },
      {
        name: "detail",
        path: "/:id",
        preload: async (params: Params) => {
          const data = await api.getProduct(String(params.id));

          store.set("products.detail", data);
        },
        onEnter: (toState) => {
          const id =
            typeof toState.params.id === "string" ? toState.params.id : "";

          loadData("products.detail", (signal) => api.getProduct(id, signal));
        },
        onLeave: abortPending,
      },
    ],
  },
];
