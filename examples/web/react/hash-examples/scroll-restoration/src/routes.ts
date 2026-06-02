import type { Route } from "@real-router/core";

export const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "docs", path: "/docs" },
  {
    name: "articles",
    path: "/articles",
    children: [{ name: "article", path: "/:id" }],
  },
  { name: "gallery", path: "/gallery" },
  { name: "settings", path: "/settings" },
];
