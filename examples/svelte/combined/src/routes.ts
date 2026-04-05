import { z } from "zod";

import { can } from "../../../shared/abilities";
import { api } from "../../../shared/api";
import { store } from "../../../shared/store";

import type { AppDependencies } from "./types";
import type { GuardFnFactory, Params, Route } from "@real-router/core";

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

// Always succeeds after 600ms delay — demonstrates progress bar only. See async-guards example for denial demo.
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

export const publicRoutes: Route[] = [
  { name: "home", path: "/" },
  { name: "login", path: "/login" },
];

export const privateRoutes: Route<AppDependencies>[] = [
  { name: "home", path: "/", forwardTo: "dashboard" },
  { name: "dashboard", path: "/dashboard" },
  {
    name: "products",
    path: "/products",
    forwardTo: "products.list",
    children: [
      {
        name: "list",
        path: "/list?page&sort",
        defaultParams: { page: 1, sort: "name" },
        searchSchema: productsListSchema,
        preload: async () => {
          const data = await api.getProducts();

          store.set("products.list", data);
        },
        onEnter: () => {
          loadRoute("products.list", () => api.getProducts());
        },
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

          loadRoute("products.detail", () => api.getProduct(id));
        },
      },
    ],
  },
  {
    name: "users",
    path: "/users",
    forwardTo: "users.list",
    children: [
      { name: "list", path: "/list" },
      { name: "profile", path: "/:id" },
    ],
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
