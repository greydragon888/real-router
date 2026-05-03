import { createRouter, type Router } from "@real-router/core";

import { routes } from "./routes";

export function createAppRouter(): Router {
  return createRouter(routes, { defaultRoute: "home", allowNotFound: true });
}
