import type { Route } from "@real-router/core";

export const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "products", path: "/products?sort" },
  { name: "productDetail", path: "/products/:id" },
  { name: "about", path: "/about" },
  { name: "queryDemo", path: "/query-demo?filter" },
  { name: "reducedMotion", path: "/reduced-motion" },
  { name: "abortRacing", path: "/abort-racing" },
];
