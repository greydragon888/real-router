import { api } from "../../../shared/api";

import type { Params, Route } from "@real-router/core";

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
        loadData: (_params: Params, signal?: AbortSignal) => api.getProducts(signal),
      },
      {
        name: "detail",
        path: "/:id",
        loadData: (params: Params, signal?: AbortSignal) => {
          const id = typeof params.id === "string" ? params.id : "";

          return api.getProduct(id, signal);
        },
      },
    ],
  },
];
