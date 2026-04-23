import type { Route } from "@real-router/core";

export const routes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "products",
    path: "/products",
    children: [
      {
        name: "product",
        path: "/:id",
        children: [{ name: "edit", path: "/edit" }],
      },
    ],
  },
  { name: "categories", path: "/categories" },
  { name: "cart", path: "/cart" },
  { name: "checkout", path: "/checkout" },
  { name: "about", path: "/about" },
];
