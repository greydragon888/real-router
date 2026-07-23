import { z } from "zod";

import { can } from "../../../../shared/abilities";
import { api } from "../../../../shared/api";
import { store } from "../../../../shared/store";

import type { AppDependencies } from "./types";
import type { GuardFnFactory, Params, Route } from "@real-router/core";
import type { PreloadTarget } from "@real-router/preload-plugin";

const productsListSchema = z.object({
  page: z.number().int().positive().default(1),
  sort: z.enum(["name", "price", "date"]).default("name"),
});

function loadRoute(routeName: string, fetcher: () => Promise<unknown>): void {
  store.set(`${routeName}:loading`, true);
  store.set(`${routeName}:error`, null);

  void (async () => {
    try {
      store.set(routeName, await fetcher());
      store.set(`${routeName}:loading`, false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      store.set(`${routeName}:error`, message);
      store.set(`${routeName}:loading`, false);
    }
  })();
}

const adminGuard: GuardFnFactory<AppDependencies> = (_router, getDep) => {
  return () => {
    const abilities = getDep("abilities");

    return can(abilities, "manage", "admin");
  };
};

// Always succeeds after 600ms delay — demonstrates progress bar only.
function checkoutGuardFn(
  _toState: unknown,
  _fromState: unknown,
  signal?: AbortSignal,
): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const approved = true;
    const timer = setTimeout(() => {
      resolve(approved);
    }, 600);

    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

const checkoutGuard: GuardFnFactory = () => checkoutGuardFn;

function settingsDeactivateGuardFn(): Promise<boolean> {
  const hasUnsaved =
    (store.get("settings:unsaved") as boolean | undefined) ?? false;

  if (!hasUnsaved) {
    return Promise.resolve(true);
  }

  return Promise.resolve(
    globalThis.confirm("You have unsaved changes. Leave anyway?"),
  );
}

const settingsDeactivateGuard: GuardFnFactory = () => settingsDeactivateGuardFn;

async function preloadProducts(): Promise<void> {
  const data = await api.getProducts();

  store.set("products", data);
}

function fetchProducts(): Promise<unknown> {
  return api.getProducts();
}

function onEnterProducts(): void {
  loadRoute("products", fetchProducts);
}

async function preloadProductDetail(target: PreloadTarget): Promise<void> {
  const data = await api.getProduct(getParamId(target.params));

  store.set("products.detail", data);
}

function getParamId(params: Params): string {
  return typeof params.id === "string" ? params.id : "";
}

function onEnterProductDetail(toState: { params: Params }): void {
  const id = getParamId(toState.params);

  loadRoute("products.detail", () => api.getProduct(id));
}

export const publicRoutes: Route[] = [
  { name: "home", path: "/" },
  { name: "login", path: "/login" },
];

export const privateRoutes: Route<AppDependencies>[] = [
  { name: "home", path: "/", forwardTo: "dashboard" },
  { name: "dashboard", path: "/dashboard" },
  {
    name: "products",
    path: "/products?page&sort",
    defaultParams: { page: 1, sort: "name" },
    searchSchema: productsListSchema,
    preload: () => preloadProducts,
    onEnter: () => onEnterProducts,
    children: [
      {
        name: "detail",
        path: "/:id",
        preload: () => preloadProductDetail,
        onEnter: () => onEnterProductDetail,
      },
    ],
  },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
  {
    name: "settings",
    path: "/settings",
    canDeactivate: settingsDeactivateGuard,
  },
  {
    name: "admin",
    path: "/admin",
    canActivate: adminGuard,
  },
  {
    name: "checkout",
    path: "/checkout",
    canActivate: checkoutGuard,
  },
];
