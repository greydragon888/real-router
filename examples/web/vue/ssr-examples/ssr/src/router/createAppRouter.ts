import { createRouter, type Router } from "@real-router/core";

import { routes } from "./routes";

export function createAppRouter(deps?: Record<string, unknown>): Router {
  return createRouter(
    routes,
    { defaultRoute: "home", allowNotFound: true },
    deps,
  );
}
