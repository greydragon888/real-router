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
        loadData: () => api.getProducts(),
      },
      {
        name: "detail",
        path: "/:id",
        loadData: (params: Params) => {
          const id = typeof params.id === "string" ? params.id : "";

          return api.getProduct(id);
        },
      },
    ],
  },
];
