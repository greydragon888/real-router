import type { Route } from "@real-router/core";

export const routes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "products",
    path: "/products?sort",
    defaultSearch: { sort: "asc" },
    children: [{ name: "detail", path: "/:id" }],
  },
  { name: "about", path: "/about" },
  {
    name: "queryDemo",
    path: "/query-demo?filter",
    defaultSearch: { filter: "all" },
  },
];
