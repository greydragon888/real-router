import type { Route } from "@real-router/core";

// nested variant — shared section layout (node "sec") with two sibling leaves
// a/b. Switching a↔b keeps the layout mounted; only the inner match swaps.
export const routes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "sec",
    path: "/sec",
    children: [
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ],
  },
];
