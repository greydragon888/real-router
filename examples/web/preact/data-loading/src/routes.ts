import { api } from "../../../../shared/api";
import { store } from "../../../../shared/store";

import type { Params, Route } from "@real-router/core";
import type { PreloadTarget } from "@real-router/preload-plugin";

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

async function preloadProducts(): Promise<void> {
  const data = await api.getProducts();

  store.set("products", data);
}

function fetchProductsWithSignal(signal: AbortSignal): Promise<unknown> {
  return api.getProducts(signal);
}

function onEnterProducts(): void {
  loadData("products", fetchProductsWithSignal);
}

function getParamId(params: Params): string {
  return typeof params.id === "string" ? params.id : "";
}

async function preloadProductDetail({ params }: PreloadTarget): Promise<void> {
  const data = await api.getProduct(getParamId(params));

  store.set("products.detail", data);
}

function onEnterProductDetail(toState: { params: Params }): void {
  const id = getParamId(toState.params);

  loadData("products.detail", (signal) => api.getProduct(id, signal));
}

export const routes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "products",
    path: "/products",
    preload: () => preloadProducts,
    onEnter: () => onEnterProducts,
    onLeave: () => abortPending,
    children: [
      {
        name: "detail",
        path: "/:id",
        preload: () => preloadProductDetail,
        onEnter: () => onEnterProductDetail,
        onLeave: () => abortPending,
      },
    ],
  },
];
