import type { Route } from "@real-router/core";

export const routes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "products",
    path: "/products",
    children: [
      { name: "list", path: "/" },
      { name: "detail", path: "/:id" },
    ],
  },
];
