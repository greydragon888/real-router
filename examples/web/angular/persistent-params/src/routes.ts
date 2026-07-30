import type { Route } from "@real-router/core";

export const routes: Route[] = [
  { name: "home", path: "/?lang&theme" },
  { name: "about", path: "/about?lang&theme" },
  { name: "contacts", path: "/contacts?lang&theme" },
];
