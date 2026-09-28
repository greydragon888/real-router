import type { Route } from "@real-router/core";

// table-heap variant — build N synthetic routes (?n=N), then the harness
// measures retained JS heap. Mirrors apps/solid/real-router/tableheap.
export const routeCount = Number(
  new URLSearchParams(location.search).get("n") ?? "1",
);

export const routes: Route[] = [
  { name: "home", path: "/" },
  ...Array.from({ length: routeCount }, (_, i) => ({
    name: `r${i}`,
    path: `/r${i}`,
  })),
];
