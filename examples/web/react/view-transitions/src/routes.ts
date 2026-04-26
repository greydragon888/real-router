import type { Route } from "@real-router/core";

export const routes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "products",
    path: "/products?sort",
    defaultParams: { sort: "asc" },
    children: [{ name: "detail", path: "/:id" }],
  },
  { name: "about", path: "/about" },
  {
    name: "queryDemo",
    path: "/query-demo?filter",
    defaultParams: { filter: "all" },
  },
];
